export type VirtualFile = {
    path: string;       // e.g. scripts/widgets/Button_1/onClick.js
    content: string;    // normalized text
};

export type VirtualTree = Map<string, VirtualFile>;

export type RepoFile = {
    path: string;
    content: string;
    sha: string;
};

export type RepoTree = Map<string, RepoFile>;

export type DiffStatus = "added" | "modified" | "deleted";

export type DiffEntry = {
    path: string;
    status: DiffStatus;
    oldContent?: string;
    newContent?: string;
    sha?: string; // GitHub SHA when applicable
};
