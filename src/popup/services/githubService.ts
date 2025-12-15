import { config } from '../config';

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

// --- Utility: Generate CSPRNG Session ID ---

export function generateSessionId(byteLength: number = 32): string {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
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
    const response = await fetch(`${config.BACKEND_BASE_URL}/api/auth/token`, {
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
        console.error('Failed to get installation token. Status:', response.status, 'Body:', errorText);

        let errorMessage = errorText;
        try {
            const json = JSON.parse(errorText);
            errorMessage = json.message || json.error || JSON.stringify(json);
        } catch (e) {
            // Not JSON, use raw text or status text
            errorMessage = errorText || response.statusText;
        }

        throw new Error(`Failed to get installation token: ${errorMessage}`);
    }

    const data: TokenResponse = await response.json();

    // Handle opportunistic token rotation
    const newDeviceToken = response.headers.get('X-New-Device-Token');

    return {
        accessToken: data.accessToken,
        validUntil: data.validUntil,
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

// --- Repos: List Accessible Repositories ---

export async function listRepositories(accessToken: string): Promise<Repository[]> {
    const response = await fetch('https://api.github.com/installation/repositories', {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to list repositories: ${response.statusText}`);
    }

    const data = await response.json();
    return data.repositories as Repository[];
}

// --- Git: Get Repository Tree (Recursive) ---

export async function getRepoTree(accessToken: string, owner: string, repo: string, branch: string): Promise<TreeItem[]> {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
        },
    });

    if (!response.ok) {
        if (response.status === 404) {
            // Branch or repo doesn't exist, return empty tree (useful for new repos)
            return [];
        }
        throw new Error(`Failed to get repo tree: ${response.statusText}`);
    }

    const data = await response.json();
    return data.tree as TreeItem[];
}

// --- Git: Get File Content by SHA ---

export async function getFileContent(accessToken: string, owner: string, repo: string, sha: string): Promise<string> {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs/${sha}`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github.raw+json', // Get raw content
            'X-GitHub-Api-Version': '2022-11-28',
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to get file content: ${response.statusText}`);
    }

    return await response.text();
}

// --- Git: Push File (Create or Update) ---

export async function pushFile(
    accessToken: string,
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    sha?: string, // Include SHA for updates
    branch: string = config.DEFAULT_BRANCH
): Promise<{ commitSha: string; htmlUrl: string }> {
    const body: any = {
        message,
        content: btoa(unescape(encodeURIComponent(content))), // Base64 encode content
        branch,
    };

    if (sha) {
        body.sha = sha;
    }

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Failed to push file ${path}: ${response.statusText} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    return {
        commitSha: data.commit.sha,
        htmlUrl: data.content.html_url,
    };
}

// --- Git: Delete File ---

export async function deleteFile(
    accessToken: string,
    owner: string,
    repo: string,
    path: string,
    message: string,
    sha: string,
    branch: string = config.DEFAULT_BRANCH
): Promise<{ commitSha: string }> {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
            message,
            sha,
            branch,
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to delete file ${path}: ${response.statusText}`);
    }

    const data = await response.json();
    return {
        commitSha: data.commit.sha,
    };
}
