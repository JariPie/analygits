import { config } from '../config';
import {
    validateGitHubParams,
    sanitizeErrorMessage,
    createUserFriendlyError,
    ApiError,
    ValidationError,
} from '../../utils/security';

// Development mode flag
const IS_DEV = import.meta.env?.DEV ?? false;

// --- Types ---

export interface HandshakePollResponse {
    status: 'pending' | 'ready';
    deviceToken?: string;
    expiration?: string; // ISO 8601 date string
}

export interface TokenResponse {
    accessToken: string;
    validUntil: string; // ISO 8601 date string
}

export interface Repository {
    id: number;
    name: string;
    full_name: string;
    owner: {
        login: string;
    };
    default_branch: string;
    private: boolean;
}

export interface TreeItem {
    path: string;
    mode: string;
    type: 'blob' | 'tree';
    sha: string;
    size?: number;
    url: string;
}

export interface FileDiff {
    path: string;
    status: 'added' | 'modified' | 'deleted';
    oldContent?: string;
    newContent?: string;
    sha?: string; // SHA of the existing file in GitHub (needed for updates/deletes)
}

export interface GitHubUser {
    id: number;
    login: string;
    name: string | null;
    email: string | null;
}

export interface CommitResult {
    commitSha: string;
    htmlUrl: string;
}

// --- Module State ---

let commitInFlight = false;
let lastCommitHash: string | null = null;
let cachedUserProfile: GitHubUser | null = null;

// --- Utility: Generate CSPRNG Session ID ---

export function generateSessionId(byteLength: number = 32): string {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- Utility: Hash for Idempotency ---
// Simple hash component: Message + Sorted File Paths + Contents
async function computeCommitHash(message: string, diffs: FileDiff[]): Promise<string> {
    const parts: string[] = [message];
    // Sort diffs by path to ensure consistent order
    const sortedDiffs = [...diffs].sort((a, b) => a.path.localeCompare(b.path));

    for (const diff of sortedDiffs) {
        parts.push(diff.path);
        parts.push(diff.status);
        if (diff.status !== 'deleted' && diff.newContent) {
            parts.push(diff.newContent);
        }
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(parts.join('|'));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- Utility: Fetch with Timeout ---

async function fetchWithTimeout(
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


// --- Auth: Install URL ---

export function getInstallUrl(sessionId: string): string {
    return `https://github.com/apps/${config.GITHUB_APP_SLUG}/installations/new?state=${sessionId}`;
}

// --- Auth: Poll for Handshake Completion ---

export async function pollHandshake(sessionId: string): Promise<HandshakePollResponse> {
    const response = await fetch(`${config.BACKEND_BASE_URL}/api/handshake/poll`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId }),
    });

    if (response.status === 202) {
        return { status: 'pending' };
    }

    if (!response.ok) {
        throw new Error(`Handshake poll failed: ${response.statusText}`);
    }

    const data = await response.json();
    return {
        status: 'ready',
        deviceToken: data.deviceToken,
        expiration: data.expiration,
    };
}

// --- Auth: Get GitHub Installation Access Token ---

export async function getInstallationToken(deviceToken: string): Promise<{ accessToken: string; validUntil: string; newDeviceToken?: string }> {
    if (!deviceToken || typeof deviceToken !== 'string') {
        throw new ValidationError('deviceToken', 'Device token is required');
    }

    const response = await fetchWithTimeout(`${config.BACKEND_BASE_URL}/api/auth/token`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${deviceToken}`,
        },
    });

    if (!response.ok) {
        if (response.status === 401) {
            throw new Error('Device token is invalid or expired. Please re-authenticate.');
        }

        const errorText = await response.text();
        // Log safely without exposing token details
        console.error('Failed to get installation token. Status:', response.status);
        if (IS_DEV) {
            console.debug('Error details:', sanitizeErrorMessage(errorText));
        }

        let errorMessage = errorText;
        try {
            const json = JSON.parse(errorText);
            errorMessage = json.message || json.error || JSON.stringify(json);
        } catch (e) {
            // Not JSON, use raw text or status text
            errorMessage = errorText || response.statusText;
        }

        throw new Error(`Failed to get installation token: ${sanitizeErrorMessage(errorMessage)}`);
    }

    const data = await response.json();

    // Validate response structure
    if (!data.accessToken || typeof data.accessToken !== 'string') {
        throw new Error('Invalid token response from server');
    }

    // Handle both field names: API returns 'expiresAt', interface expects 'validUntil'
    const validUntil = data.validUntil || data.expiresAt;
    if (!validUntil || typeof validUntil !== 'string') {
        throw new Error('Invalid token expiry in response');
    }

    // Validate token format (basic sanity check)
    if (data.accessToken.length < 20) {
        throw new Error('Received malformed access token');
    }

    // Handle opportunistic token rotation
    const newDeviceToken = response.headers.get('X-New-Device-Token');

    return {
        accessToken: data.accessToken,
        validUntil: validUntil,
        newDeviceToken: newDeviceToken || undefined,
    };
}

// --- Auth: Revoke Device Token ---

export async function revokeDeviceToken(deviceToken: string): Promise<void> {
    const response = await fetch(`${config.BACKEND_BASE_URL}/api/auth/token`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${deviceToken}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to revoke device token: ${response.statusText}`);
    }
}

// --- User Profile ---

export async function getUserProfile(accessToken: string, fallbackLogin?: string): Promise<GitHubUser> {
    if (cachedUserProfile) return cachedUserProfile;

    try {
        // Optimization: GitHub App Installation tokens (starting with 'ghs_') cannot access /user
        // We skip the request to avoid a guaranteed 403 Forbidden error in the console.
        let isForbidden = accessToken.startsWith('ghs_');

        if (!isForbidden) {
            const response = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                },
            });

            if (response.ok) {
                const data = await response.json();
                cachedUserProfile = {
                    id: data.id,
                    login: data.login,
                    name: data.name,
                    email: data.email,
                };
                return cachedUserProfile!;
            }

            if (response.status === 403) {
                isForbidden = true;
            }
        }

        if (isForbidden && fallbackLogin) {
            console.warn('Access to /user forbidden (likely installation token). Attempting to use repo owner details as fallback.');
            // Try to get public profile of the repo owner
            // This is a heuristic: if the user owns the repo, they are likely the author.
            const publicResp = await fetch(`https://api.github.com/users/${fallbackLogin}`, {
                headers: {
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                    // No token to avoid 403 if token is scoped to just the repo
                },
            });

            if (publicResp.ok) {
                const data = await publicResp.json();
                if (data.type === 'User') {
                    cachedUserProfile = {
                        id: data.id,
                        login: data.login,
                        name: data.name,
                        email: data.email, // Often null in public profile
                    };
                    return cachedUserProfile!;
                }
            }
        }
    } catch (e) {
        console.warn('Failed to fetch user profile, using placeholder.', e);
    }

    // Fallback Placeholder if we can't identify the user
    // This allows the commit to proceed even if we can't get the author's real identity.
    // The user accepts "Hybrid Authorship", so a placeholder is better than a crash.
    console.warn('Using placeholder identity for commit author.');
    cachedUserProfile = {
        id: 0,
        login: 'user',
        name: 'AnalyGits User',
        email: 'user@analygits.local',
    };
    return cachedUserProfile!;
}

// --- User Profile: Clear Cache ---

export function clearCachedUserProfile(): void {
    cachedUserProfile = null;
}


// --- Repos: List Accessible Repositories ---

export async function listRepositories(accessToken: string): Promise<Repository[]> {
    if (!accessToken || typeof accessToken !== 'string') {
        throw new ValidationError('accessToken', 'Access token is required');
    }

    const response = await fetchWithTimeout('https://api.github.com/installation/repositories', {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
        },
    });

    if (!response.ok) {
        throw new ApiError(response.status, response.statusText, 'Failed to list repositories');
    }

    const data = await response.json();
    return data.repositories as Repository[];
}

// --- Git: Get Repository Tree (Recursive) ---

export async function getRepoTree(
    accessToken: string,
    owner: string,
    repo: string,
    branch: string
): Promise<TreeItem[]> {
    // Validate all parameters
    const validation = validateGitHubParams({ owner, repo, branch });
    if (!validation.valid) {
        throw new ValidationError('params', validation.errors.join('; '));
    }

    const response = await fetchWithTimeout(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
        {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
            cache: 'no-store',  // Prevent browser caching after push
        }
    );

    if (!response.ok) {
        if (response.status === 404 || response.status === 409) {
            return [];
        }
        throw new ApiError(response.status, response.statusText, 'Failed to get repository tree');
    }

    const data = await response.json();
    return data.tree as TreeItem[];
}

// --- Git: Get File Content by SHA ---

export async function getFileContent(
    accessToken: string,
    owner: string,
    repo: string,
    sha: string
): Promise<string> {
    // Validate parameters
    const validation = validateGitHubParams({ owner, repo, sha });
    if (!validation.valid) {
        throw new ValidationError('params', validation.errors.join('; '));
    }

    const response = await fetchWithTimeout(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(sha)}`,
        {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/vnd.github.raw+json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
            cache: 'no-store',  // Prevent browser caching
        }
    );

    if (!response.ok) {
        throw new ApiError(response.status, response.statusText, 'Failed to get file content');
    }

    return await response.text();
}

// --- Git Database API Helpers ---

async function createBlob(accessToken: string, owner: string, repo: string, content: string): Promise<string> {
    // Content here is plain text; GitHub expects UTF-8 string or Base64.
    // We'll trust GitHub to handle the JSON encoding for 'utf-8'.
    const response = await fetchWithTimeout(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                content: content,
                encoding: 'utf-8',
            }),
        }
    );

    if (!response.ok) {
        throw new ApiError(response.status, response.statusText, 'Failed to create blob');
    }

    const data = await response.json();
    return data.sha;
}

// Helper to get HEAD SHA for branch
async function getRef(accessToken: string, owner: string, repo: string, branch: string): Promise<{ sha: string; url: string }> {
    const response = await fetchWithTimeout(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(branch)}`,
        {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/vnd.github+json',
            },
        }
    );
    if (!response.ok) {
        throw new ApiError(response.status, response.statusText, `Failed to get ref heads/${branch}`);
    }
    const data = await response.json();
    return { sha: data.object.sha, url: data.object.url };
}

async function createTree(accessToken: string, owner: string, repo: string, baseTreeSha: string, treeItems: any[]): Promise<string> {
    const response = await fetchWithTimeout(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                base_tree: baseTreeSha,
                tree: treeItems,
            }),
        }
    );

    if (!response.ok) {
        throw new ApiError(response.status, response.statusText, 'Failed to create tree');
    }
    const data = await response.json();
    return data.sha;
}

async function createCommit(
    accessToken: string,
    owner: string,
    repo: string,
    message: string,
    treeSha: string,
    parents: string[],
    author: { name: string; email: string; date?: string }
): Promise<string> {
    const response = await fetchWithTimeout(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message,
                tree: treeSha,
                parents,
                author, // Inject author here
            }),
        }
    );

    if (!response.ok) {
        throw new ApiError(response.status, response.statusText, 'Failed to create commit');
    }
    const data = await response.json();
    return data.sha;
}

async function updateRef(accessToken: string, owner: string, repo: string, branch: string, sha: string): Promise<void> {
    const response = await fetchWithTimeout(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs/heads/${encodeURIComponent(branch)}`,
        {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                sha,
                force: false,
            }),
        }
    );

    if (!response.ok) {
        throw new ApiError(response.status, response.statusText, `Failed to update ref heads/${branch}`);
    }
}


// --- Main: Push Changes (Atomic) ---

export async function pushChanges(
    accessToken: string,
    owner: string,
    repo: string,
    branch: string,
    message: string,
    diffs: FileDiff[],
    selectedPaths: string[]
): Promise<CommitResult> {
    // Add validation at the start
    const validation = validateGitHubParams({ owner, repo, branch });
    if (!validation.valid) {
        throw new ValidationError('params', validation.errors.join('; '));
    }

    if (commitInFlight) {
        throw new Error('A commit is already in progress. Please wait.');
    }

    // 1. Idempotency Check
    const filteredDiffs = diffs.filter(d => selectedPaths.includes(d.path));
    if (filteredDiffs.length === 0) {
        throw new Error('No files selected to commit.');
    }

    const currentHash = await computeCommitHash(message, filteredDiffs);
    if (currentHash === lastCommitHash) {
        console.warn('Idempotency prevented duplicate commit.');
        throw new Error('This commit has already been processed (duplicate submission prevented).');
    }

    commitInFlight = true;

    try {
        // 2. Fetch User Profile (Author)
        // Pass repo owner as fallback hint
        const user = await getUserProfile(accessToken, owner);
        const authorEmail = user.email || `${user.id}+${user.login}@users.noreply.github.com`;
        const authorName = user.name || user.login;

        // 3. Get HEAD
        const headRef = await getRef(accessToken, owner, repo, branch);
        const headSha = headRef.sha;

        // 4. Create Blobs & Prepare Tree Items
        const treeItems = [];

        for (const diff of filteredDiffs) {
            if (diff.status === 'deleted') {
                // For delete, we add to tree with sha: null (or omit sha?? GitHub API says remove using sha: null in update??
                // Actually, Git Database API: "If you want to delete a file... set sha to null"
                // Ref: https://docs.github.com/en/rest/git/trees?apiVersion=2022-11-28#create-a-tree
                treeItems.push({
                    path: diff.path,
                    mode: '100644', // Placeholder mode, technically ignored for deletes but good form
                    type: 'blob',
                    sha: null, // Critical for deletion
                });
            } else {
                // Added or Modified
                if (!diff.newContent) {
                    throw new Error(`Missing content for ${diff.path}`);
                }
                const blobSha = await createBlob(accessToken, owner, repo, diff.newContent);
                treeItems.push({
                    path: diff.path,
                    mode: '100644', // Text file mode
                    type: 'blob',
                    sha: blobSha,
                });
            }
        }

        // 5. Create Tree
        const newTreeSha = await createTree(accessToken, owner, repo, headSha, treeItems);

        // 6. Create Commit
        // Note: githubService uses ISO dates, creating one is fine
        const commitSha = await createCommit(accessToken, owner, repo, message, newTreeSha, [headSha], {
            name: authorName,
            email: authorEmail,
            date: new Date().toISOString(),
        });

        // 7. Update Ref (Move HEAD)
        await updateRef(accessToken, owner, repo, branch, commitSha);

        // Success!
        lastCommitHash = currentHash; // Store hash to prevent replay

        return {
            commitSha,
            htmlUrl: `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commit/${commitSha}`,
        };

    } catch (error) {
        // Sanitize error before re-throwing
        const userMessage = createUserFriendlyError(error, 'Commit failed');
        console.error('[GitHubService] Push failed:', sanitizeErrorMessage(error));
        throw new Error(userMessage);
    } finally {
        commitInFlight = false;
    }
}

