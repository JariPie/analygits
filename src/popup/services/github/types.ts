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

/** Internal type for Git tree operations */
export interface GitTreeItem {
    path: string;
    mode: string;
    type: 'blob' | 'tree';
    sha: string | null; // null for deletions
}