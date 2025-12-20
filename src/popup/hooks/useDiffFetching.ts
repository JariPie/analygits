import { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { type FileDiff, getRepoTree, getFileContent } from '../services/githubService';
import { buildVirtualStoryTree } from '../../diff/adapter';
import { diffTrees } from '../../diff/diff';
import type { RepoTree } from '../../diff/types';
import type { ParsedStoryContent } from '../utils/sacParser';
import { getDeepestSharedScope } from '../utils/scopeCalculator';

interface UseDiffFetchingParams {
    initialContent: ParsedStoryContent | null;
    onFetchLatest: () => Promise<ParsedStoryContent | null>;
}

interface UseDiffFetchingResult {
    diffs: FileDiff[];
    selectedPaths: string[];
    setSelectedPaths: React.Dispatch<React.SetStateAction<string[]>>;
    loading: boolean;
    error: string | null;
    setError: React.Dispatch<React.SetStateAction<string | null>>;
    hasCheckedDiff: boolean;
    suggestedScope: string | undefined;
    fetchDiff: () => Promise<void>;
}

/**
 * Custom hook for fetching and diffing SAC story content against GitHub repository.
 */
export function useDiffFetching({
    initialContent,
    onFetchLatest,
}: UseDiffFetchingParams): UseDiffFetchingResult {
    const { t } = useTranslation();
    const { getAccessToken, selectedRepo, branch } = useAuth();

    const [diffs, setDiffs] = useState<FileDiff[]>([]);
    const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasCheckedDiff, setHasCheckedDiff] = useState(false);

    const suggestedScope = useMemo(() => {
        return getDeepestSharedScope(selectedPaths);
    }, [selectedPaths]);

    // Reset state when repo changes
    useEffect(() => {
        setDiffs([]);
        setHasCheckedDiff(false);
        setError(null);
    }, [selectedRepo?.id]);

    const fetchDiff = useCallback(async () => {
        if (!initialContent || !selectedRepo) {
            setError(t('github.errors.fetchFirst'));
            return;
        }

        setLoading(true);
        setError(null);
        setDiffs([]);
        setSelectedPaths([]);
        setHasCheckedDiff(false);

        try {
            // 0. Refresh Data from SAC
            const freshContent = await onFetchLatest();
            if (!freshContent) {
                throw new Error(t('app.errors.sacEmptyResponse') || "Failed to refresh story content from SAC.");
            }

            const token = await getAccessToken();

            // 1. Build Local Tree (using FRESH content)
            const localTree = buildVirtualStoryTree(freshContent);

            // 2. Fetch Remote Tree Structure
            const treeItems = await getRepoTree(token, selectedRepo.owner.login, selectedRepo.name, branch);

            // 3. Filter relevant remote files and construct RepoTree
            if (localTree.size === 0) {
                setError(t('github.errors.noContent'));
                return;
            }
            const firstPath = localTree.keys().next().value;
            if (!firstPath) {
                setError(t('github.errors.noStoryPath'));
                return;
            }
            const storyDir = firstPath.split('/').slice(0, 2).join('/');

            const repoTree: RepoTree = new Map();

            // Identify files to fetch
            const pathsToFetch = new Set<string>();
            const remoteItemMap = new Map(treeItems.map(item => [item.path, item]));

            for (const path of localTree.keys()) {
                if (remoteItemMap.has(path)) {
                    pathsToFetch.add(path);
                }
            }

            for (const item of treeItems) {
                if (item.path.startsWith(storyDir + '/') && item.type === 'blob') {
                    pathsToFetch.add(item.path);
                }
            }

            // Concurrency
            const CONCURRENCY = 5;
            const fetchFile = async (path: string, sha: string) => {
                try {
                    const content = await getFileContent(token, selectedRepo.owner.login, selectedRepo.name, sha);
                    repoTree.set(path, { path, content, sha });
                } catch {
                    // Ignore missing files
                }
            };

            const queue = Array.from(pathsToFetch);
            const runQueue = async () => {
                while (queue.length > 0) {
                    const path = queue.shift()!;
                    const item = remoteItemMap.get(path);
                    if (item) await fetchFile(path, item.sha);
                }
            };

            const workers = Array(Math.min(CONCURRENCY, queue.length)).fill(null).map(() => runQueue());
            await Promise.all(workers);

            // 4. Compute Diffs
            const computedDiffs = diffTrees(localTree, repoTree);

            const uiDiffs: FileDiff[] = computedDiffs.map(d => ({
                path: d.path,
                status: d.status,
                oldContent: d.oldContent,
                newContent: d.newContent,
                sha: d.sha
            }));

            setDiffs(uiDiffs);
            setSelectedPaths(uiDiffs.map(d => d.path));
            setHasCheckedDiff(true);

        } catch (err: unknown) {
            console.error(err);
            const message = err instanceof Error ? err.message : t('github.errors.diffFailed');
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [initialContent, selectedRepo, branch, getAccessToken, onFetchLatest, t]);

    return {
        diffs,
        selectedPaths,
        setSelectedPaths,
        loading,
        error,
        setError,
        hasCheckedDiff,
        suggestedScope,
        fetchDiff,
    };
}
