/// <reference types="chrome" />

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.type === "FETCH_DATA") {
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
});
