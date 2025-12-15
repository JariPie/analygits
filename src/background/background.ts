/// <reference types="chrome" />

// Configuration (duplicated to avoid import issues in pure SW if not bundled)
const BACKEND_BASE_URL = 'https://api.analygits.com';

// Alarm name prefix
const ALARM_PREFIX = 'poll_auth_';

// Handle alarms for polling
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name.startsWith(ALARM_PREFIX)) {
        const sessionId = alarm.name.replace(ALARM_PREFIX, '');
        await checkHandshake(sessionId);
    }
});

async function startPolling(sessionId: string) {
    console.log('🔄 [Background] Starting alarm polling for session:', sessionId);

    // Check immediately first
    const done = await checkHandshake(sessionId);
    if (done) return;

    // Create alarm to check every 2 seconds
    // Note: In Chrome extensions, alarms under 1 minute might fire less frequently 
    // unless the extension is unpacked (developer mode).
    chrome.alarms.create(ALARM_PREFIX + sessionId, {
        periodInMinutes: 0.05 // ~3 seconds
    });
}

async function stopPolling(sessionId: string) {
    console.log('🛑 [Background] Stopping polling for session:', sessionId);
    await chrome.alarms.clear(ALARM_PREFIX + sessionId);
}

async function checkHandshake(sessionId: string): Promise<boolean> {
    try {
        console.log('📡 [Background] Checking handshake status...');
        const response = await fetch(`${BACKEND_BASE_URL}/api/handshake/poll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
        });

        if (response.status === 200) {
            const data = await response.json();
            console.log('✅ [Background] Auth success! Received token.');

            await chrome.storage.local.set({
                analygits_auth: {
                    deviceToken: data.deviceToken,
                    deviceTokenExpiry: data.expiration,
                    selectedRepo: null,
                    branch: 'main'
                }
            });

            await stopPolling(sessionId);
            return true;
        } else if (response.status === 202) {
            console.log('⏳ [Background] Still pending...');
            return false;
        } else {
            console.warn('⚠️ [Background] Unexpected poll status:', response.status);
            // Don't stop polling on transient errors, but maybe we should if 4xx/5xx persists
            // For now, continue polling
            return false;
        }
    } catch (error) {
        console.error('❌ [Background] Poll error:', error);
        return false;
    }
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    // ... existing FETCH_DATA handler ...
    if (request.type === "FETCH_DATA") {
        // ... (existing code, will keep it in the replace block) ...
        const { url, method = "GET", body, headers = {} } = request;

        const performRequest = async (csrfToken?: string) => {
            const finalHeaders = {
                "Accept": "application/json, text/plain, */*",
                "X-Requested-With": "XMLHttpRequest",
                "Content-Type": "application/json",
                ...headers
            };

            if (csrfToken) {
                finalHeaders["X-CSRF-Token"] = csrfToken;
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
                    try {
                        const tokenResponse = await fetch(url, {
                            method: "HEAD", // or GET
                            credentials: "include",
                            headers: {
                                "X-CSRF-Token": "Fetch",
                                "X-Requested-With": "XMLHttpRequest"
                            }
                        });

                        const token = tokenResponse.headers.get("x-csrf-token");
                        if (token) {
                            const data = await performRequest(token);
                            sendResponse({ ok: true, data });
                            return;
                        }
                    } catch (e) {
                        console.warn("Failed to fetch CSRF token, proceeding without it", e);
                    }
                }

                // Default behavior (GET or POST without explicit token fetch success)
                const data = await performRequest();
                sendResponse({ ok: true, data });

            } catch (e: any) {
                sendResponse({ ok: false, error: e.toString() });
            }
        })();

        return true;
    }

    // New Handler for Auth Polling
    if (request.type === "START_AUTH_POLL") {
        const { sessionId } = request;
        if (sessionId) {
            startPolling(sessionId);
            sendResponse({ started: true });
        }
    }
});

// Listener for tab updates to detect SAC Stories
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        // Check for Story ID in query param OR in hash path (e.g. /s2/ID/)
        const isStory = tab.url.includes("storyId=") ||
            (tab.url.includes("/story2&/s2/") && tab.url.includes("sap/fpa/ui")) ||
            (tab.url.includes("mode=present") && tab.url.includes("/story"));

        if (isStory) {
            chrome.action.setBadgeText({ text: "SAC", tabId: tabId });
            chrome.action.setBadgeBackgroundColor({ color: "#0a6ed1", tabId: tabId });
        } else {
            chrome.action.setBadgeText({ text: "", tabId: tabId });
        }
    }
});
