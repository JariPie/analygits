/**
 * Fetch with configurable timeout
 * 
 * Note: This is intentionally separate from secureFetch in utils/security.ts.
 * GitHub service constructs URLs internally from validated parameters, so
 * URL allowlisting would be redundant. This keeps the GitHub module self-contained.
 * 
 * @throws Error with 'Request timed out' message on timeout
 */
export async function fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs = 30000
): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('Request timed out');
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Generate a cryptographically secure session ID
 * Uses Web Crypto API for CSPRNG
 */
export function generateSessionId(byteLength = 32): string {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}