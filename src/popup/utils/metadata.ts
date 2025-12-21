export function fetchMetadataXml(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        try {
            if (!chrome?.runtime?.sendMessage) {
                console.warn("Chrome runtime not found. Fetching directly (will likely fail CORS if not proxied).");
                fetch(url).then(r => r.text()).then(resolve).catch(reject);
                return;
            }

            chrome.runtime.sendMessage({ type: "FETCH_METADATA", url }, (res) => {
                if (chrome.runtime.lastError) {
                    return reject(chrome.runtime.lastError.message);
                }
                if (!res) return reject("No response from background");
                if (!res.ok) return reject(res.error);
                resolve(res.data);
            });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            reject(message);
        }
    });
}
