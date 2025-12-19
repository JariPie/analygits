/// <reference types="chrome" />

// Configuration (duplicated to avoid import issues in pure SW if not bundled)
const BACKEND_BASE_URL = 'https://api.analygits.com';
const GITHUB_APP_SLUG = 'analygitsapp'; // Correct slug from config.ts

// --- Types ---

type GithubConnectState = {
    status:
    | "idle"
    | "starting"
    | "waiting-for-install"
    | "polling"
    | "connected"
    | "error";

    sessionId?: string;
    deviceToken?: string;
    lastError?: string;
    pollAttempt?: number;

    timestamps: {
        startedAt?: number;
        callbackSeenAt?: number;
        connectedAt?: number;
    };
};

type StoredData = {
    githubConnectState?: GithubConnectState;
    analygits_auth?: {
        deviceToken: string;
        deviceTokenExpiry?: number;
        selectedRepo: null;
        branch: string;
    };
};

// --- Helpers ---

function generateSessionId(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function updateState(updates: Partial<GithubConnectState>) {
    const { githubConnectState } = await chrome.storage.local.get("githubConnectState") as StoredData;
    const newState = { ...githubConnectState, ...updates } as GithubConnectState;
    await chrome.storage.local.set({ githubConnectState: newState });

    // Optional: Log state change
    console.log("[GitHub Connect] State updated:", updates.status, newState);

    // Notify popup if needed, suppressing "Receiving end does not exist" error
    chrome.runtime.sendMessage({ type: "GITHUB_CONNECT_STATUS", payload: newState }, () => {
        // Just access lastError to suppress the "Uncaught runtime.lastError" message
        void chrome.runtime.lastError;
    });

    return newState;
}

// --- Polling Logic ---

async function pollHandshake(sessionId: string, startAttempt = 0) {
    console.log(`[GitHub Connect] Polling handshake for session ${sessionId}, starting at attempt ${startAttempt}`);

    // Ensure state reflects polling
    await updateState({ status: 'polling' });

    for (let attempt = startAttempt; attempt <= 60; attempt++) {
        console.log(`[GitHub Connect] Poll attempt ${attempt}/60`);

        // Check for cancellation or status change elsewhere (safety check)
        const checkState = await chrome.storage.local.get("githubConnectState") as StoredData;
        if (checkState.githubConnectState?.sessionId !== sessionId) {
            console.log("[GitHub Connect] Session ID changed, stopping poll.");
            return;
        }

        try {
            const res = await fetch(`${BACKEND_BASE_URL}/api/handshake/poll`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId }),
            });

            console.log(`[GitHub Connect] Backend response: ${res.status}`);

            if (res.status === 200) {
                const data = await res.json();
                console.log("[GitHub Connect] Use connection success!", data);

                // Save persistent auth data
                await chrome.storage.local.set({
                    analygits_auth: {
                        deviceToken: data.deviceToken,
                        deviceTokenExpiry: data.expiration, // logic depends on backend response
                        selectedRepo: null,
                        branch: 'main'
                    }
                });

                await updateState({
                    status: "connected",
                    deviceToken: data.deviceToken, // Duplicate for debug visibility or consolidate later
                    timestamps: { ...checkState.githubConnectState?.timestamps, connectedAt: Date.now() },
                    pollAttempt: attempt
                });
                return;
            }

            if (res.status !== 202) {
                // Unexpected error
                throw new Error(`Unexpected status ${res.status}`);
            }

            // Still pending (202)
            // Persist progress
            await updateState({ pollAttempt: attempt });

        } catch (err: any) {
            console.error("[GitHub Connect] Poll error:", err);
            await updateState({ lastError: err.message, status: "error" });
            return;
        }

        await delay(2000); // Wait 2s
    }

    // Timeout
    console.error("[GitHub Connect] Polling timed out.");
    await updateState({ lastError: "Polling timed out after 60 attempts", status: "error" });
}

async function startConnectFlow() {
    console.log("[GitHub Connect] Starting flow...");
    const sessionId = generateSessionId();

    await updateState({
        status: "starting",
        sessionId,
        pollAttempt: 0,
        timestamps: { startedAt: Date.now() },
        lastError: undefined
    });

    const installUrl = `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new?state=${sessionId}`;
    console.log("[GitHub Connect] Opening install URL:", installUrl);

    chrome.tabs.create({ url: installUrl });

    await updateState({ status: "waiting-for-install" });

    // Begin polling immediately
    pollHandshake(sessionId);
}


// --- Resilience & Recovery ---

async function resumeIfNeeded() {
    console.log("[GitHub Connect] Checking if resume needed...");
    const { githubConnectState } = await chrome.storage.local.get("githubConnectState") as StoredData;

    if (
        (githubConnectState?.status === "waiting-for-install" || githubConnectState?.status === "polling") &&
        githubConnectState.sessionId
    ) {
        console.log("[GitHub Connect] Resuming polling after restart/reload");
        const lastAttempt = githubConnectState.pollAttempt || 0;
        // Resume polling
        pollHandshake(githubConnectState.sessionId, lastAttempt + 1);
    }
}

// Hook into lifecycle events to ensure we resume if the worker died
chrome.runtime.onStartup.addListener(resumeIfNeeded);
chrome.runtime.onInstalled.addListener(resumeIfNeeded);


// --- Message Handling ---

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {

    // Auth Flow Start
    if (request.type === "GITHUB_CONNECT_START") {
        startConnectFlow();
        sendResponse({ started: true }); // Async start
        return true;
    }

    // Existing FETCH_DATA handler
    if (request.type === "FETCH_DATA") {
        const { url, method = "GET", body, headers = {} } = request;

        const performRequest = async (csrfToken?: string) => {
            // Normalize passed headers to lowercase for comparison to avoid duplicates
            const passedHeadersLower = new Map<string, string>();
            for (const [key, _value] of Object.entries(headers)) {
                passedHeadersLower.set(key.toLowerCase(), key); // Store original key
            }

            const finalHeaders: Record<string, string> = {};

            // Only set defaults if not already provided by caller
            if (!passedHeadersLower.has("accept")) {
                finalHeaders["Accept"] = "application/json, text/plain, */*";
            }
            if (!passedHeadersLower.has("x-requested-with")) {
                finalHeaders["X-Requested-With"] = "XMLHttpRequest";
            }
            if (!passedHeadersLower.has("content-type")) {
                finalHeaders["Content-Type"] = "application/json";
            }

            // Merge with passed headers (passed headers take precedence)
            for (const [key, value] of Object.entries(headers)) {
                finalHeaders[key] = value as string;
            }

            // Add CSRF token if we have one
            if (csrfToken) {
                finalHeaders["X-CSRF-Token"] = csrfToken;
            }

            console.log(`[Background] Performing ${method} to ${url}`);
            console.log("[Background] Final headers:", finalHeaders);
            if (method === "POST") {
                console.log("[Background] POST Body:", body);
                console.log("[Background] POST Body size:", JSON.stringify(body).length);
            }

            const response = await fetch(url, {
                method,
                credentials: "include",
                headers: finalHeaders,
                body: body ? JSON.stringify(body) : undefined
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`HTTP ${response.status}: ${response.statusText} - ${text.substring(0, 200)}`);
            }
            return response.text();
        };

        (async () => {
            try {
                // For POST requests, try to fetch CSRF token first
                if (method === "POST") {
                    let token: string | null | undefined = null;

                    // Helper to fetch token from a specific URL
                    const fetchToken = async (targetUrl: string) => {
                        try {
                            const resp = await fetch(targetUrl, {
                                method: "GET",
                                credentials: "include",
                                headers: {
                                    "X-CSRF-Token": "Fetch",
                                    "X-Requested-With": "XMLHttpRequest",
                                    "Accept": "application/json, text/plain, */*"
                                }
                            });
                            return resp.headers.get("x-csrf-token");
                        } catch (e) {
                            console.warn(`[Background] CSRF fetch failed for ${targetUrl}`, e);
                            return null;
                        }
                    };

                    // 1. Try fetching from the actual request URL
                    token = await fetchToken(url);

                    // 2. Fallback: Try fetching from the origin/root if the first attempt failed
                    if (!token) {
                        try {
                            const origin = new URL(url).origin;
                            console.log(`[Background] CSRF fetch failed for URL, retrying with origin: ${origin}`);
                            token = await fetchToken(origin + "/");
                        } catch (e) {
                            console.error("[Background] Could not determine origin for CSRF fallback", e);
                        }
                    }

                    if (token) {
                        console.log("[Background] Using CSRF token:", token.substring(0, 20) + "...");
                        const data = await performRequest(token);
                        sendResponse({ ok: true, data });
                        return;
                    } else {
                        console.warn("[Background] Failed to obtain CSRF token. Proceeding without it.");
                    }
                }

                // Default behavior (GET or POST without explicit token fetch success)
                const data = await performRequest();
                sendResponse({ ok: true, data });

            } catch (e: any) {
                console.error("[Background] Request failed:", e);
                sendResponse({ ok: false, error: e.toString() });
            }
        })();

        return true;
    }
});

// --- Visual State Management ---

function resetIconState(tabId: number) {
    chrome.action.setBadgeText({ text: "", tabId });
    chrome.action.setIcon({
        tabId,
        path: {
            "16": "icons/16x16.png",
            "32": "icons/32x32.png",
            "48": "icons/48x48.png",
            "128": "icons/128x128.png"
        }
    }).catch(() => { });
}

// Listener for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    // Ensure any custom Visuals are cleared
    if (changeInfo.status === 'complete' || changeInfo.url) {
        resetIconState(tabId);
    }
});

// Listener for tab activation
chrome.tabs.onActivated.addListener((activeInfo) => {
    resetIconState(activeInfo.tabId);
});

// Cleanup (just in case)
chrome.tabs.onRemoved.addListener(() => {
    // No-op, state is cleaned up by browser
});
