import {
    validateGitHubParams,
    sanitizeErrorMessage,
    createUserFriendlyError,
    ApiError,
    ValidationError,
} from '../../../utils/security';
import { fetchWithTimeout } from './utils';
import { getUserProfile } from './auth';
import type { Repository, TreeItem, FileDiff, CommitResult, GitTreeItem } from './types';

// --- Module State ---

let commitInFlight = false;
let lastCommitHash: string | null = null;

// --- Idempotency Hash ---

async function computeCommitHash(message: string, diffs: FileDiff[]): Promise<string> {
    const parts: string[] = [message];
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
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// --- Repository Operations ---

export async function listRepositories(accessToken: string): Promise<Repository[]> {
    if (!accessToken || typeof accessToken !== 'string') {
        throw new ValidationError('accessToken', 'Access token is required');
    }

    const response = await fetchWithTimeout('https://api.github.com/installation/repositories', {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
        },
    });

    if (!response.ok) {
        throw new ApiError(response.status, response.statusText, 'Failed to list repositories');
    }

    const data = await response.json();
    return data.repositories as Repository[];
}

// --- Tree & Content Operations ---

export async function getRepoTree(
    accessToken: string,
    owner: string,
    repo: string,
    branch: string
): Promise<TreeItem[]> {
    const validation = validateGitHubParams({ owner, repo, branch });
    if (!validation.valid) {
        throw new ValidationError('params', validation.errors.join('; '));
    }

    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`;

    const response = await fetchWithTimeout(url, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
        },
        cache: 'no-store',
    });

    if (!response.ok) {
        // Empty repo or branch not found
        if (response.status === 404 || response.status === 409) {
            return [];
        }
        throw new ApiError(response.status, response.statusText, 'Failed to get repository tree');
    }

    const data = await response.json();
    return data.tree as TreeItem[];
}

export async function getFileContent(
    accessToken: string,
    owner: string,
    repo: string,
    sha: string
): Promise<string> {
    const validation = validateGitHubParams({ owner, repo, sha });
    if (!validation.valid) {
        throw new ValidationError('params', validation.errors.join('; '));
    }

    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(sha)}`;

    const response = await fetchWithTimeout(url, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github.raw+json',
            'X-GitHub-Api-Version': '2022-11-28',
        },
        cache: 'no-store',
    });

    if (!response.ok) {
        throw new ApiError(response.status, response.statusText, 'Failed to get file content');
    }

    return response.text();
}

// --- Git Database API Helpers (Internal) ---

async function createBlob(
    accessToken: string,
    owner: string,
    repo: string,
    content: string
): Promise<string> {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs`;

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            content,
            encoding: 'utf-8',
        }),
    });

    if (!response.ok) {
        throw new ApiError(response.status, response.statusText, 'Failed to create blob');
    }

    const data = await response.json();
    return data.sha;
}

async function getRef(
    accessToken: string,
    owner: string,
    repo: string,
    branch: string
): Promise<{ sha: string; url: string }> {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(branch)}`;

    const response = await fetchWithTimeout(url, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
        },
    });

    if (!response.ok) {
        throw new ApiError(response.status, response.statusText, `Failed to get ref heads/${branch}`);
    }

    const data = await response.json();
    return { sha: data.object.sha, url: data.object.url };
}

async function createTree(
    accessToken: string,
    owner: string,
    repo: string,
    baseTreeSha: string,
    treeItems: GitTreeItem[]
): Promise<string> {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees`;

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            base_tree: baseTreeSha,
            tree: treeItems,
        }),
    });

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
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits`;

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            message,
            tree: treeSha,
            parents,
            author,
        }),
    });

    if (!response.ok) {
        throw new ApiError(response.status, response.statusText, 'Failed to create commit');
    }

    const data = await response.json();
    return data.sha;
}

async function updateRef(
    accessToken: string,
    owner: string,
    repo: string,
    branch: string,
    sha: string
): Promise<void> {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs/heads/${encodeURIComponent(branch)}`;

    const response = await fetchWithTimeout(url, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            sha,
            force: false,
        }),
    });

    if (!response.ok) {
        throw new ApiError(response.status, response.statusText, `Failed to update ref heads/${branch}`);
    }
}

// --- Main: Atomic Push ---

export async function pushChanges(
    accessToken: string,
    owner: string,
    repo: string,
    branch: string,
    message: string,
    diffs: FileDiff[],
    selectedPaths: string[]
): Promise<CommitResult> {
    const validation = validateGitHubParams({ owner, repo, branch });
    if (!validation.valid) {
        throw new ValidationError('params', validation.errors.join('; '));
    }

    if (commitInFlight) {
        throw new Error('A commit is already in progress. Please wait.');
    }

    // Filter to selected files
    const filteredDiffs = diffs.filter((d) => selectedPaths.includes(d.path));
    if (filteredDiffs.length === 0) {
        throw new Error('No files selected to commit.');
    }

    // Idempotency check
    const currentHash = await computeCommitHash(message, filteredDiffs);
    if (currentHash === lastCommitHash) {
        console.warn('Idempotency prevented duplicate commit.');
        throw new Error('This commit has already been processed (duplicate submission prevented).');
    }

    commitInFlight = true;

    try {
        // Fetch user profile for commit author
        const user = await getUserProfile(accessToken, owner);
        const authorEmail = user.email || `${user.id}+${user.login}@users.noreply.github.com`;
        const authorName = user.name || user.login;

        // Get current HEAD
        const headRef = await getRef(accessToken, owner, repo, branch);
        const headSha = headRef.sha;

        // Create blobs and prepare tree items
        const treeItems: GitTreeItem[] = [];

        for (const diff of filteredDiffs) {
            if (diff.status === 'deleted') {
                treeItems.push({
                    path: diff.path,
                    mode: '100644',
                    type: 'blob',
                    sha: null, // null signals deletion
                });
            } else {
                if (!diff.newContent) {
                    throw new Error(`Missing content for ${diff.path}`);
                }
                const blobSha = await createBlob(accessToken, owner, repo, diff.newContent);
                treeItems.push({
                    path: diff.path,
                    mode: '100644',
                    type: 'blob',
                    sha: blobSha,
                });
            }
        }

        // Create new tree
        const newTreeSha = await createTree(accessToken, owner, repo, headSha, treeItems);

        // Create commit
        const commitSha = await createCommit(accessToken, owner, repo, message, newTreeSha, [headSha], {
            name: authorName,
            email: authorEmail,
            date: new Date().toISOString(),
        });

        // Update branch reference
        await updateRef(accessToken, owner, repo, branch, commitSha);

        // Store hash to prevent replay
        lastCommitHash = currentHash;

        return {
            commitSha,
            htmlUrl: `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commit/${commitSha}`,
        };
    } catch (error) {
        const userMessage = createUserFriendlyError(error, 'Commit failed');
        console.error('[GitHubService] Push failed:', sanitizeErrorMessage(error));
        throw new Error(userMessage);
    } finally {
        commitInFlight = false;
    }
}

// --- Testing Utilities ---

/** Reset module state (for testing only) */
export function _resetState(): void {
    commitInFlight = false;
    lastCommitHash = null;
}