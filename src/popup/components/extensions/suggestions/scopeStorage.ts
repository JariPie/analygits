const SCOPE_STORAGE_KEY = 'commit_recent_scopes';
const MAX_SCOPES = 20;

/**
 * Get recently used scopes from localStorage
 */
export function getRecentScopes(): string[] {
    const stored = localStorage.getItem(SCOPE_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
}

/**
 * Add a scope to the recent list (moves to front if exists)
 */
export function addRecentScope(scope: string): void {
    if (!scope.trim()) return;
    const scopes = getRecentScopes().filter(s => s !== scope);
    scopes.unshift(scope);
    localStorage.setItem(SCOPE_STORAGE_KEY, JSON.stringify(scopes.slice(0, MAX_SCOPES)));
}

/**
 * Filter scopes by prefix query
 */
export function filterScopes(query: string): string[] {
    const scopes = getRecentScopes();
    if (!query) return scopes.slice(0, 10);
    return scopes
        .filter(s => s.toLowerCase().startsWith(query.toLowerCase()))
        .slice(0, 10);
}
