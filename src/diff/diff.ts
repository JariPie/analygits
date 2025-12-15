import type { VirtualTree, RepoTree, DiffEntry } from './types';

/**
 * Compares a local virtual tree (from SAC) against a remote repo tree (from GitHub).
 * Returns a deterministic list of diff entries.
 */
export function diffTrees(
    localTree: VirtualTree,
    repoTree: RepoTree
): DiffEntry[] {
    const diffs: DiffEntry[] = [];

    // Union of all paths
    const allPaths = new Set([...localTree.keys(), ...repoTree.keys()]);

    // Process every path
    for (const path of allPaths) {
        const local = localTree.get(path);
        const repo = repoTree.get(path);

        // Case 1: Added (only in local)
        if (local && !repo) {
            diffs.push({
                path,
                status: "added",
                newContent: local.content
                // no sha for added file unless we want to indicate something else, but per spec 'added -> include newContent'
            });
            continue;
        }

        // Case 2: Deleted (only in repo)
        if (!local && repo) {
            diffs.push({
                path,
                status: "deleted",
                oldContent: repo.content,
                sha: repo.sha
            });
            continue;
        }

        // Case 3: Both exist - check for modification
        if (local && repo) {
            if (local.content !== repo.content) {
                diffs.push({
                    path,
                    status: "modified",
                    oldContent: repo.content,
                    newContent: local.content,
                    sha: repo.sha
                });
            }
            // if equal, do nothing (ignore unchanged)
        }
    }

    // Sort output lexicographically by path for deterministic output
    diffs.sort((a, b) => a.path.localeCompare(b.path));

    return diffs;
}

/**
 * Utility helper to create trees from array of objects (useful for tests/fixtures).
 */
export function treeFromFiles(
    files: { path: string; content: string; sha?: string }[]
): VirtualTree | RepoTree {
    // Since VirtualTree and RepoTree are Maps with slightly different value types,
    // we can treat them similarly if we are careful. 
    // VirtualFile doesn't have SHA. RepoFile has SHA.
    // We'll cast based on usage, or return a Map<string, any>.

    // Actually, Typescript might complain if we try to return "VirtualTree | RepoTree" 
    // because the Value types are different.
    // Let's return a generic map or handle it.

    const map = new Map<string, any>();
    for (const f of files) {
        map.set(f.path, f);
    }
    return map as any; // Cast to satisfy the union return type locally, usage will imply strictness
}
