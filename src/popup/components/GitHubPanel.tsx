import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import RepoPicker from './RepoPicker';
import DiffViewer from './DiffViewer';
import CommitMessageEditor from './CommitMessageEditor';
import {
    type FileDiff,
    getRepoTree,
    pushFile,
    deleteFile,
    getFileContent,
} from '../services/githubService';
import { getDeepestSharedScope } from '../utils/scopeCalculator';
import { buildVirtualStoryTree } from '../../diff/adapter';
import { diffTrees } from '../../diff/diff';
import type { RepoTree } from '../../diff/types';
import type { ParsedStoryContent } from '../utils/sacParser';

interface GitHubPanelProps {
    parsedContent: ParsedStoryContent | null;
}

const GitHubPanel: React.FC<GitHubPanelProps> = ({ parsedContent }) => {
    const { t } = useTranslation();
    const { status, getAccessToken, selectedRepo, branch } = useAuth();

    const [diffs, setDiffs] = useState<FileDiff[]>([]);
    const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
    const [commitMessage, setCommitMessage] = useState('');
    const [isCommitValid, setIsCommitValid] = useState(false);
    const [diffLoading, setDiffLoading] = useState(false);
    const [pushLoading, setPushLoading] = useState(false);
    const [pushStatus, setPushStatus] = useState<{ success: number; failed: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    // --- Scope Suggestion ---
    const suggestedScope = useMemo(() => {
        return getDeepestSharedScope(selectedPaths);
    }, [selectedPaths]);


    // --- Fetch & Diff ---
    const handleFetchDiff = useCallback(async () => {
        if (!parsedContent || !selectedRepo) {
            setError(t('github.errors.fetchFirst'));
            return;
        }

        setDiffLoading(true);
        setError(null);
        setDiffs([]);
        setPushStatus(null);
        setSelectedPaths([]);

        try {
            const token = await getAccessToken();

            // 1. Build Local Tree
            const localTree = buildVirtualStoryTree(parsedContent);

            // 2. Fetch Remote Tree Structure
            const treeItems = await getRepoTree(token, selectedRepo.owner.login, selectedRepo.name, branch);

            // 3. Filter relevant remote files and construct RepoTree
            // We only care about files that differ or exist in our local tree scope
            // For now, let's just get everything? No, that's too much for a big repo.
            // We only care about files inside `stories/<StoryName>`? 
            // Yes, strictly scoped.

            // Determine the base path of the story
            // HACK: inspect one local file to guess base path or reuse logic
            // `localTree` has keys like `stories/My_Story/README.md`
            if (localTree.size === 0) {
                setError(t('github.errors.noContent'));
                return;
            }
            const firstPath = localTree.keys().next().value; // e.g. stories/X/README.md
            if (!firstPath) {
                setError(t('github.errors.noStoryPath'));
                return;
            }
            const storyDir = firstPath.split('/').slice(0, 2).join('/'); // "stories/X"

            const repoTree: RepoTree = new Map();

            // Identify files to fetch:
            // - Files in local tree (to check for modification)
            // - Files in remote tree under `storyDir` (to check for deletion)

            const pathsToFetch = new Set<string>();
            const remoteItemMap = new Map(treeItems.map(item => [item.path, item]));

            // Add local paths that exist remotely
            for (const path of localTree.keys()) {
                if (remoteItemMap.has(path)) {
                    pathsToFetch.add(path);
                }
            }

            // Add remote paths that are in the story dir (for potential deletion)
            for (const item of treeItems) {
                if (item.path.startsWith(storyDir + '/') && item.type === 'blob') {
                    pathsToFetch.add(item.path);
                }
            }

            // Concurrency Limit
            const CONCURRENCY = 5;

            const fetchFile = async (path: string, sha: string) => {
                try {
                    const content = await getFileContent(token, selectedRepo.owner.login, selectedRepo.name, sha);
                    repoTree.set(path, { path, content, sha });
                } catch (e) {
                    console.error(`Failed to fetch ${path}`, e);
                    // Treat as missing in repo tree (will show as added if local exists, or ignore)
                }
            };

            // Execute fetches with concurrency control
            const queue = Array.from(pathsToFetch);

            // Helper to run queue
            const runQueue = async () => {
                while (queue.length > 0) {
                    const path = queue.shift()!;
                    const item = remoteItemMap.get(path);
                    if (item) {
                        await fetchFile(path, item.sha);
                    }
                }
            };

            const workers = Array(Math.min(CONCURRENCY, queue.length)).fill(null).map(() => runQueue());
            await Promise.all(workers);

            // 4. Compute Diffs
            const computedDiffs = diffTrees(localTree, repoTree);

            // 5. Update State
            // Map diff-engine Types to UI Types (FileDiff from githubService is compatible with DiffEntry mostly)
            // DiffAdapter: DiffEntry -> FileDiff
            const uiDiffs: FileDiff[] = computedDiffs.map(d => ({
                path: d.path,
                status: d.status,
                oldContent: d.oldContent,
                newContent: d.newContent,
                sha: d.sha
            }));

            setDiffs(uiDiffs);
            setSelectedPaths(uiDiffs.map(d => d.path)); // Select all by default

        } catch (err: any) {
            console.error(err);
            setError(err.message || t('github.errors.diffFailed'));
        } finally {
            setDiffLoading(false);
        }
    }, [parsedContent, selectedRepo, branch, getAccessToken]);


    // --- Push Changes ---
    const handlePush = useCallback(async () => {
        if (!selectedRepo || diffs.length === 0) return;

        // Message is now single string from editor
        if (!commitMessage || !isCommitValid) {
            setError(t('github.errors.invalidCommit'));
            return;
        }

        setPushLoading(true);
        setError(null);

        // Re-build local tree to ensure we have content for Pushes
        // (Diffs might not have newContent if it was Unchanged, but we filter diffs anyway)
        const localTree = buildVirtualStoryTree(parsedContent!);

        let successCount = 0;
        let failCount = 0;

        try {
            const token = await getAccessToken();

            for (const diff of diffs) {
                if (!selectedPaths.includes(diff.path)) continue;

                try {
                    if (diff.status === 'deleted') {
                        await deleteFile(
                            token,
                            selectedRepo.owner.login,
                            selectedRepo.name,
                            diff.path,
                            commitMessage,
                            diff.sha!,
                            branch
                        );
                    } else {
                        // For Added/Modified, we need the content
                        const content = localTree.get(diff.path)?.content;
                        if (content === undefined) {
                            throw new Error(t('github.errors.contentNotFound', { path: diff.path }));
                        }

                        await pushFile(
                            token,
                            selectedRepo.owner.login,
                            selectedRepo.name,
                            diff.path,
                            content,
                            commitMessage,
                            diff.sha,
                            branch
                        );
                    }
                    successCount++;
                } catch (err: any) {
                    console.error(`Failed to push ${diff.path}:`, err);
                    failCount++;
                }
            }

            setPushStatus({ success: successCount, failed: failCount });

            // Refresh diffs after push
            if (successCount > 0) {
                await handleFetchDiff();
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setPushLoading(false);
        }
    }, [selectedRepo, diffs, selectedPaths, commitMessage, isCommitValid, branch, getAccessToken, parsedContent, handleFetchDiff]);

    if (status !== 'connected') {
        return null;
    }

    return (
        <div className="github-panel card">
            {/* Repo Picker */}
            <RepoPicker />

            {/* Diff Section */}
            {selectedRepo && (
                <div className="github-diff-section">
                    <button
                        className="primary-button"
                        onClick={handleFetchDiff}
                        disabled={diffLoading || !parsedContent}
                    >
                        {diffLoading ? t('common.loading') : t('github.actions.fetchDiff')}
                    </button>

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
