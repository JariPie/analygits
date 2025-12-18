import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import RepoPicker from './RepoPicker';
import DiffViewer from './DiffViewer';
import CommitMessageEditor from './CommitMessageEditor';
import {
    type FileDiff,
    getRepoTree,
    pushChanges,
    getFileContent,
} from '../services/githubService';
import { getDeepestSharedScope } from '../utils/scopeCalculator';
import { buildVirtualStoryTree } from '../../diff/adapter';
import { diffTrees } from '../../diff/diff';
import type { RepoTree } from '../../diff/types';
import type { ParsedStoryContent } from '../utils/sacParser';

interface GitHubPanelProps {
    parsedContent: ParsedStoryContent | null;
    onFetchLatest: () => Promise<ParsedStoryContent | null>;
}

const GitHubPanel: React.FC<GitHubPanelProps> = ({ parsedContent: initialContent, onFetchLatest }) => {
    const { t } = useTranslation();
    const { status, getAccessToken, selectedRepo, branch } = useAuth();

    // Use local state if we want, but actually we should just rely on what returns from fetch
    // or fallback to initialContent if needed.
    // However, App.tsx updates parsedContent state anyway, so initialContent will update eventually.
    // But for THIS function execution, we need the return value of onFetchLatest.

    const [diffs, setDiffs] = useState<FileDiff[]>([]);
    const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
    const [commitMessage, setCommitMessage] = useState('');
    const [isCommitValid, setIsCommitValid] = useState(false);
    const [diffLoading, setDiffLoading] = useState(false);
    const [pushLoading, setPushLoading] = useState(false);
    const [pushStatus, setPushStatus] = useState<{ success: number; failed: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [hasCheckedDiff, setHasCheckedDiff] = useState(false);

    const suggestedScope = useMemo(() => {
        return getDeepestSharedScope(selectedPaths);
    }, [selectedPaths]);

    // Reset state when repo changes
    React.useEffect(() => {
        setDiffs([]);
        setHasCheckedDiff(false);
        setError(null);
        setPushStatus(null);
    }, [selectedRepo?.id]);


    // --- Fetch & Diff ---
    const handleFetchDiff = useCallback(async () => {
        // We allow starting if we have initialContent, but we'll refresh it immediately.
        if (!initialContent || !selectedRepo) {
            setError(t('github.errors.fetchFirst'));
            return;
        }

        setDiffLoading(true);
        setError(null);
        setDiffs([]);
        setPushStatus(null);
        setSelectedPaths([]);
        setHasCheckedDiff(false);

        try {
            // 0. Refresh Data from SAC (Critical for "Current State")
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
                } catch (e) {
                    // Ignore missing
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

        } catch (err: any) {
            console.error(err);
            setError(err.message || t('github.errors.diffFailed'));
        } finally {
            setDiffLoading(false);
        }
    }, [initialContent, selectedRepo, branch, getAccessToken, onFetchLatest]);


    // --- Push Changes ---
    const handlePush = useCallback(async () => {
        if (!selectedRepo || diffs.length === 0) return;

        if (!commitMessage || !isCommitValid) {
            setError(t('github.errors.invalidCommit'));
            return;
        }

        setPushLoading(true);
        setError(null);

        try {
            const token = await getAccessToken();

            const result = await pushChanges(
                token,
                selectedRepo.owner.login,
                selectedRepo.name,
                branch,
                commitMessage,
                diffs,
                selectedPaths
            );

            setPushStatus({ success: selectedPaths.length, failed: 0 });
            console.log('Committed as', result.commitSha);

            // Refresh diffs after push
            await handleFetchDiff();

        } catch (err: any) {
            console.error('Push failed:', err);
            setError(err.message);
            setPushStatus({ success: 0, failed: selectedPaths.length });
        } finally {
            setPushLoading(false);
        }
    }, [selectedRepo, diffs, selectedPaths, commitMessage, isCommitValid, branch, getAccessToken, handleFetchDiff, initialContent]);

    if (status !== 'connected') {
        return null;
    }

    const hasDiffs = diffs.length > 0;

    return (
        <div className="github-panel card">
            {/* Repo Picker */}
            <RepoPicker onRefresh={hasDiffs ? handleFetchDiff : undefined} />

            {/* Diff Section */}
            {selectedRepo && (
                <div className="github-diff-section">
                    {!hasDiffs && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1rem' }}>
                            <button
                                className="primary-button"
                                onClick={handleFetchDiff}
                                disabled={diffLoading || !initialContent}
                            >
                                {diffLoading ? t('common.loading') : t('github.actions.fetchDiff')}
                            </button>

                            {hasCheckedDiff && !diffLoading && !error && (
                                <div className="success-message" style={{ marginTop: '0.5rem' }}>
                                    {t('github.status.upToDate')}
                                </div>
                            )}
                        </div>
                    )}

                    {error && <div className="error-message">{error}</div>}

                    {diffs.length > 0 && (
                        <>
                            <DiffViewer diffs={diffs} onFileSelect={setSelectedPaths} />

                            <div className="commit-section">
                                <CommitMessageEditor
                                    onCommitMessageChange={(msg, valid) => {
                                        setCommitMessage(msg);
                                        setIsCommitValid(valid);
                                    }}
                                    suggestedScope={suggestedScope}
                                />

                                <button
                                    className="primary-button push-button"
                                    onClick={handlePush}
                                    disabled={pushLoading || !isCommitValid || selectedPaths.length === 0}
                                >
                                    {pushLoading ? t('github.actions.pushing') : t('github.actions.pushFiles', { count: selectedPaths.length })}
                                </button>

                                {pushStatus && (
                                    <div className={`push-status ${pushStatus.failed > 0 ? 'partial' : 'success'}`}>
                                        {t('github.status.pushResult', { success: pushStatus.success, failed: pushStatus.failed })}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default GitHubPanel;
