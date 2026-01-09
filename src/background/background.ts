/// <reference types="chrome" />

// ============================================================================
// CONFIGURATION
// ============================================================================

const BACKEND_BASE_URL = 'https://api.analygits.com';
const GITHUB_APP_SLUG = 'analygitsapp';

// Environment detection for logging
const IS_DEV = !('update_url' in chrome.runtime.getManifest());

// ============================================================================
// SECURITY: URL ALLOWLIST
// ============================================================================

/**
 * Allowed SAC domain patterns.
 * These match the optional_host_permissions in manifest.json
 */
const ALLOWED_SAC_PATTERNS: RegExp[] = [
    /^https:\/\/[a-z0-9.-]+\.hcs\.cloud\.sap(\/|$)/i,
    /^https:\/\/[a-z0-9.-]+\.sapanalytics\.cloud(\/|$)/i,
    /^https:\/\/[a-z0-9.-]+\.hanacloudservices\.cloud\.sap(\/|$)/i,
    /^https:\/\/[a-z0-9.-]+\.sapanalyticscloud\.cn(\/|$)/i,
];

/**
 * Validates that a URL is an allowed SAC endpoint.
 * Prevents SSRF attacks by restricting fetch targets.
 */
function isAllowedSacUrl(url: string): boolean {
    try {
        const parsed = new URL(url);

        // Must be HTTPS
        if (parsed.protocol !== 'https:') {
            securityLog('URL rejected: not HTTPS', url);
            return false;
        }

        // Must match one of the SAC domain patterns
        const isAllowed = ALLOWED_SAC_PATTERNS.some(pattern => pattern.test(url));

        if (!isAllowed) {
            securityLog('URL rejected: not in allowlist', url);
        }

        return isAllowed;
    } catch (_e) {
        securityLog('URL rejected: invalid URL format', url);
        return false;
    }
}

// ============================================================================
// SECURITY: SENDER VALIDATION
// ============================================================================

/**
 * Validates that a message comes from extension's privileged contexts.
 * Blocks messages from:
 * - Other extensions
 * - Content scripts (which run in web page context)
 * - Web pages
 */
function isValidSender(sender: chrome.runtime.MessageSender): { valid: boolean; reason?: string } {
    // Must be from extension
    if (sender.id !== chrome.runtime.id) {
        return { valid: false, reason: 'Foreign extension' };
    }

    // Block messages from content scripts (they have sender.tab defined)
    // Extension only needs popup -> background communication
    if (sender.tab) {
        return { valid: false, reason: 'Content script context not authorized' };
    }

    // Verify it's from an extension page (popup, options, etc.)
    if (sender.origin) {
        const expectedOrigin = `chrome-extension://${chrome.runtime.id}`;
        if (sender.origin !== expectedOrigin) {
            return { valid: false, reason: 'Invalid origin' };
        }
    }

    return { valid: true };
}

// ============================================================================
// LOGGING UTILITIES
// ============================================================================

/**
 * Security-related logging - always enabled but sanitized
 */
function securityLog(message: string, ...args: unknown[]): void {
    // Sanitize any URLs or tokens in args for production
    const sanitizedArgs = args.map(arg => {
        if (typeof arg === 'string' && arg.length > 100) {
            return arg.substring(0, 50) + '...[truncated]';
        }
        return arg;
    });
    console.warn(`[Security] ${message}`, ...sanitizedArgs);
}

/**
 * Debug logging - only in development
 */
function debugLog(message: string, ...args: unknown[]): void {
    if (IS_DEV) {
        console.log(`[Background] ${message}`, ...args);
    }
}

/**
 * Sanitize token for logging (show first few chars only)
 */
function sanitizeToken(token: string | null | undefined): string {
    if (!token) return '(none)';
    if (token.length <= 8) return '***';
    return token.substring(0, 8) + '...';
}

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// HELPERS
// ============================================================================

function generateSessionId(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Exponential backoff delay calculation
 * Starts at 2s, increases by 1.5x each attempt, caps at 30s
 */
function getBackoffDelay(attempt: number): number {
    const baseDelay = 2000;
    const maxDelay = 30000;
    const backoffMultiplier = 1.5;
    return Math.min(baseDelay * Math.pow(backoffMultiplier, attempt), maxDelay);
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function updateState(updates: Partial<GithubConnectState>): Promise<GithubConnectState> {
    const { githubConnectState } = await chrome.storage.local.get("githubConnectState") as StoredData;
    const newState = { ...githubConnectState, ...updates } as GithubConnectState;
    await chrome.storage.local.set({ githubConnectState: newState });

    debugLog("State updated:", updates.status);

    // Notify popup if open, suppress "Receiving end does not exist" error
    chrome.runtime.sendMessage({ type: "GITHUB_CONNECT_STATUS", payload: newState }, () => {
        void chrome.runtime.lastError;
    });

    return newState;
}

// ============================================================================
// POLLING LOGIC (with exponential backoff)
// ============================================================================

async function pollHandshake(sessionId: string, startAttempt = 0): Promise<void> {
    debugLog(`Polling handshake for session, starting at attempt ${startAttempt}`);

    await updateState({ status: 'polling' });

    const MAX_ATTEMPTS = 60;

    for (let attempt = startAttempt; attempt <= MAX_ATTEMPTS; attempt++) {
        debugLog(`Poll attempt ${attempt}/${MAX_ATTEMPTS}`);

        // Check for cancellation or status change
        const checkState = await chrome.storage.local.get("githubConnectState") as StoredData;
        if (checkState.githubConnectState?.sessionId !== sessionId) {
            debugLog("Session ID changed, stopping poll");
            return;
        }

        try {
            const response = await fetch(`${BACKEND_BASE_URL}/api/handshake/poll`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ sessionId }),
            });

            if (response.status === 202) {
                // Still pending - update attempt count and wait with backoff
                await updateState({ pollAttempt: attempt });
                const backoffDelay = getBackoffDelay(attempt);
                debugLog(`Pending, waiting ${backoffDelay}ms before next attempt`);
                await delay(backoffDelay);
                continue;
            }

            if (!response.ok) {
                throw new Error(`Handshake poll failed: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.deviceToken) {
                debugLog("Handshake complete, got device token");

                // Store the device token
                await chrome.storage.local.set({
                    analygits_auth: {
                        deviceToken: data.deviceToken,
                        deviceTokenExpiry: data.expiration,
                        selectedRepo: null,
                        branch: 'main',
                    }
                });

                await updateState({
                    status: "connected",
                    deviceToken: data.deviceToken,
                    timestamps: {
                        ...checkState.githubConnectState?.timestamps,
                        connectedAt: Date.now()
                    }
                });

                return;
            }
        } catch (e) {
            console.error("[GitHub Connect] Poll error:", e);
            // Continue polling on transient errors
        }

        // Safety delay between attempts
        const backoffDelay = getBackoffDelay(attempt);
        await delay(backoffDelay);
    }

    // Timeout
    debugLog("Polling timed out");
    await updateState({ lastError: "Connection timed out. Please try again.", status: "error" });
}

async function startConnectFlow(): Promise<void> {
    debugLog("Starting GitHub connect flow...");
    const sessionId = generateSessionId();

    await updateState({
        status: "starting",
        sessionId,
        pollAttempt: 0,
        timestamps: { startedAt: Date.now() },
        lastError: undefined
    });

    const installUrl = `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new?state=${sessionId}`;
    debugLog("Opening install URL");

    chrome.tabs.create({ url: installUrl });

    await updateState({ status: "waiting-for-install" });

    // Begin polling immediately
    pollHandshake(sessionId);
}

// ============================================================================
// RESILIENCE & RECOVERY
// ============================================================================

async function resumeIfNeeded(): Promise<void> {
    debugLog("Checking if resume needed...");
    const { githubConnectState } = await chrome.storage.local.get("githubConnectState") as StoredData;

    if (
        (githubConnectState?.status === "waiting-for-install" || githubConnectState?.status === "polling") &&
        githubConnectState.sessionId
    ) {
        debugLog("Resuming polling after restart/reload");
        const lastAttempt = githubConnectState.pollAttempt || 0;
        pollHandshake(githubConnectState.sessionId, lastAttempt + 1);
    }
}

// Hook into lifecycle events
chrome.runtime.onStartup.addListener(resumeIfNeeded);
chrome.runtime.onInstalled.addListener(resumeIfNeeded);

// ============================================================================
// SAC REQUEST HANDLER
// ============================================================================

interface FetchDataRequest {
    type: "FETCH_DATA" | "FETCH_METADATA";
    url: string;
    method?: "GET" | "POST";
    body?: unknown;
    headers?: Record<string, string>;
}

async function handleSacFetch(
    request: FetchDataRequest,
    sendResponse: (response: { ok: boolean; data?: string; error?: string }) => void
): Promise<void> {
    const { url, method = "GET", body, headers = {} } = request;

    // SECURITY: Validate URL is in allowlist
    if (!isAllowedSacUrl(url)) {
        sendResponse({
            ok: false,
            error: 'URL not allowed. Only SAP Analytics Cloud domains are permitted.'
        });
        return;
    }

    const performRequest = async (csrfToken?: string): Promise<string> => {
        // Build headers, avoiding duplicates
        const passedHeadersLower = new Map<string, string>();
        for (const key of Object.keys(headers)) {
            passedHeadersLower.set(key.toLowerCase(), key);
        }

        const finalHeaders: Record<string, string> = {};

        // Set defaults if not provided
        if (!passedHeadersLower.has("accept")) {
            finalHeaders["Accept"] = "application/json, text/plain, */*";
        }
        if (!passedHeadersLower.has("x-requested-with")) {
            finalHeaders["X-Requested-With"] = "XMLHttpRequest";
        }
        if (!passedHeadersLower.has("content-type")) {
            finalHeaders["Content-Type"] = "application/json";
        }

        // Merge with passed headers
        for (const [key, value] of Object.entries(headers)) {
            finalHeaders[key] = value as string;
        }

        // Add CSRF token if available
        if (csrfToken) {
            finalHeaders["X-CSRF-Token"] = csrfToken;
        }

        debugLog(`Performing ${method} request`);

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

    try {
        // For POST requests, fetch CSRF token first
        if (method === "POST") {
            let token: string | null = null;

            const fetchCsrfToken = async (targetUrl: string): Promise<string | null> => {
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
                } catch (_e) {
                    debugLog(`CSRF fetch failed for ${targetUrl}`);
                    return null;
                }
            };

            // Try fetching from the request URL
            token = await fetchCsrfToken(url);

            // Fallback: try from origin root
            if (!token) {
                try {
                    const origin = new URL(url).origin;
                    debugLog("CSRF fetch failed for URL, retrying with origin");
                    token = await fetchCsrfToken(origin + "/");
                } catch (_e) {
                    console.error("[Background] Could not determine origin for CSRF fallback");
                }
            }

            if (token) {
                debugLog(`Using CSRF token: ${sanitizeToken(token)}`);
                const data = await performRequest(token);
                sendResponse({ ok: true, data });
                return;
            } else {
                debugLog("Failed to obtain CSRF token, proceeding without it");
            }
        }

        // Default behavior (GET or POST without CSRF)
        const data = await performRequest();
        sendResponse({ ok: true, data });

    } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.error("[Background] Request failed:", errorMessage);
        sendResponse({ ok: false, error: errorMessage });
    }
}

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // SECURITY: Validate sender
    const validation = isValidSender(sender);
    if (!validation.valid) {
        securityLog(`Blocked message from unauthorized sender: ${validation.reason}`, {
            senderId: sender.id,
            hasTab: !!sender.tab,
            origin: sender.origin
        });
        sendResponse({ ok: false, error: 'Unauthorized' });
        return true;
    }

    // Auth Flow Start
    if (request.type === "GITHUB_CONNECT_START") {
        startConnectFlow();
        sendResponse({ started: true });
        return true;
    }

    // SAC Data Fetch
    if (request.type === "FETCH_DATA") {
        handleSacFetch(request as FetchDataRequest, sendResponse);
        return true; // Keep channel open for async response
    }

    // Metadata Fetch (same security as FETCH_DATA)
    if (request.type === "FETCH_METADATA") {
        // FETCH_METADATA is essentially a GET request for metadata
        const metadataRequest: FetchDataRequest = {
            type: "FETCH_METADATA",
            url: request.url,
            method: "GET",
            headers: request.headers || {}
        };
        handleSacFetch(metadataRequest, sendResponse);
        return true;
    }

    // Unknown message type
    debugLog("Unknown message type:", request.type);
    sendResponse({ ok: false, error: 'Unknown message type' });
    return true;
});

// ============================================================================
// VISUAL STATE MANAGEMENT
// ============================================================================

function resetIconState(tabId: number): void {
    chrome.action.setBadgeText({ text: "", tabId });
    chrome.action.setIcon({
        tabId,
        path: {
            "16": "icons/16x16.png",
            "32": "icons/32x32.png",
            "48": "icons/48x48.png",
            "128": "icons/128x128.png"
        }
    }).catch(() => { /* Ignore errors for closed tabs */ });
}

// Clear visual state on tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete' || changeInfo.url) {
        resetIconState(tabId);
    }
});

// Clear visual state on tab activation
chrome.tabs.onActivated.addListener((activeInfo) => {
    resetIconState(activeInfo.tabId);
});

// Cleanup on tab removal (no-op, browser handles this)
chrome.tabs.onRemoved.addListener(() => {
    // State is cleaned up by browser
});