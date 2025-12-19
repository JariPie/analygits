import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import RepoPicker from './RepoPicker';
import DiffViewer from './DiffViewer';
import CommitMessageEditor from './CommitMessageEditor';
import { type FileDiff, getRepoTree, pushChanges, getFileContent } from '../services/githubService';
import { getDeepestSharedScope } from '../utils/scopeCalculator';
import { buildVirtualStoryTree } from '../../diff/adapter';
import { diffTrees } from '../../diff/diff';
import type { RepoTree } from '../../diff/types';
import type { ParsedStoryContent } from '../utils/sacParser';
import { getContent, updateContent, extractStoryContent } from '../../sac/sacApi';
import { parseGitHubScriptPath, patchStoryContentWithGitHubFile, removeContentFromStory } from '../../sac/revertPatch';

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
    const [revertLoading, setRevertLoading] = useState(false);
    const [revertSuccess, setRevertSuccess] = useState<string | null>(null);

    const suggestedScope = useMemo(() => {
        return getDeepestSharedScope(selectedPaths);
    }, [selectedPaths]);

    // Reset state when repo changes
    React.useEffect(() => {
        setDiffs([]);
        setHasCheckedDiff(false);
        setError(null);
        setPushStatus(null);
        setRevertSuccess(null);
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

        } catch (error: unknown) {
            console.error(error);
            const message = error instanceof Error ? error.message : t('github.errors.diffFailed');
            setError(message);
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

        } catch (error: unknown) {
            console.error('Push failed:', error);
            const message = error instanceof Error ? error.message : 'Push failed';
            setError(message);
            setPushStatus({ success: 0, failed: selectedPaths.length });
        } finally {
            setPushLoading(false);
        }
    }, [selectedRepo, diffs, selectedPaths, commitMessage, isCommitValid, branch, getAccessToken, handleFetchDiff, initialContent]);


    const handleRevert = useCallback(async () => {
        if (selectedPaths.length === 0) return;

        // Confirmation
        if (!window.confirm(t('github.warnings.revertConfirm', { path: `${selectedPaths.length} file(s)` }))) {
            return;
        }

        setRevertLoading(true);
        setError(null);
        setRevertSuccess(null);

        try {
            // 1. Fetch current story content from SAC
            const storyId = initialContent?.id;
            if (!storyId) throw new Error("Missing Story ID");

            const { resource } = await getContent(storyId);

            // 2. Extract the content object - handles both optimized and legacy structures
            const baseContent = extractStoryContent(resource.cdata);
            if (!baseContent) {
                console.error("[GitHubPanel] Could not extract content. cdata structure:", {
                    keys: Object.keys(resource.cdata || {}),
                    hasContent: !!resource.cdata?.content,
                    hasContentOptimized: !!resource.cdata?.contentOptimized
                });
                throw new Error("Could not find story content in resource.cdata");
            }

            // Get version counter for optimistic locking
            const localVer = resource.updateCounter ?? resource.cdata?.updateCounter ?? 1;
            console.log(`[GitHubPanel] Using localVer: ${localVer}`);

            // Validate structure before patching
            if (!baseContent.version || !Array.isArray(baseContent.entities)) {
                console.error("[GitHubPanel] Unexpected content structure:", {
                    hasVersion: !!baseContent.version,
                    entitiesType: typeof baseContent.entities,
                    isArray: Array.isArray(baseContent.entities),
                    keys: Object.keys(baseContent)
                });
                throw new Error("Unexpected story content structure - missing version or entities array");
            }

            console.log(`[GitHubPanel] Fetched content with version: ${baseContent.version}, entities count: ${baseContent.entities.length}`);

            // 3. Patch Loop - patch the content object iteratively
            let patchedContent = baseContent;
            for (const path of selectedPaths) {
                const diff = diffs.find(d => d.path === path);
                if (!diff) continue;

                const target = parseGitHubScriptPath(path);
                if (!target) {
                    throw new Error(`File ${path} is not a supported script.`);
                }

                console.log(`[GitHubPanel] Processing ${path} with status: ${diff.status}`);

                if (diff.status === 'added') {
                    // File exists in SAC but not in GitHub - REMOVE it
                    console.log(`[GitHubPanel] Removing ${path} (was added locally, doesn't exist in GitHub)`);
                    patchedContent = removeContentFromStory({
                        storyContent: patchedContent,
                        githubPath: path
                    });
                } else if (diff.status === 'deleted') {
                    // File exists in GitHub but not in SAC - RESTORE it
                    if (!diff.oldContent) {
                        throw new Error(`Cannot restore ${path} - missing GitHub content.`);
                    }
                    console.log(`[GitHubPanel] Restoring ${path} from GitHub (was deleted locally)`);
                    patchedContent = patchStoryContentWithGitHubFile({
                        storyContent: patchedContent,
                        githubPath: path,
                        githubFileText: diff.oldContent
                    });
                } else {
                    // Modified - replace with GitHub version
                    if (!diff.oldContent) {
                        throw new Error(`Cannot revert ${path} - missing GitHub content.`);
                    }
                    console.log(`[GitHubPanel] Reverting ${path} to GitHub version`);
                    console.log(`[GitHubPanel]   SAC length: ${diff.newContent?.length ?? 0}, GitHub length: ${diff.oldContent.length}`);
                    patchedContent = patchStoryContentWithGitHubFile({
                        storyContent: patchedContent,
                        githubPath: path,
                        githubFileText: diff.oldContent
                    });
                }
            }

            // 4. Update SAC with the patched content
            console.log(`[GitHubPanel] Sending patched content to SAC...`);

            await updateContent({
                resourceId: resource.resourceId,
                name: resource.name,
                description: resource.description ?? "",
                content: patchedContent,
                localVer: localVer  // Pass the version counter
            });

            setRevertSuccess(t('github.status.reverted'));

            // 5. Refresh to show updated status
            await onFetchLatest();
            await handleFetchDiff();

        } catch (error: unknown) {
            console.error("Revert failed:", error);
            const message = error instanceof Error ? error.message : 'Revert failed';
            setError(message);
        } finally {
            setRevertLoading(false);
        }
    }, [selectedPaths, diffs, initialContent, t, onFetchLatest, handleFetchDiff]);

    const canRevert = useMemo(() => {
        if (selectedPaths.length === 0) return false;

        return selectedPaths.every(path => {
            const target = parseGitHubScriptPath(path);
            if (!target) return false;

            const diff = diffs.find(d => d.path === path);
            if (!diff) return false;

            // Can revert: modified, added (will remove), deleted (will restore if has oldContent)
            if (diff.status === 'added') return true;
            if (diff.status === 'deleted') return !!diff.oldContent;
            if (diff.status === 'modified') return !!diff.oldContent;

            return false;
        });
    }, [selectedPaths, diffs]);

    if (status !== 'connected') {
        return null;
    }

    const hasDiffs = diffs.length > 0;

    // --- Skeleton Loader Component ---
    const SkeletonDiffLoader = () => (
        <div style={{ marginTop: '1rem' }}>
            {/* Diff Items Skeleton */}
            {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton-diff-item">
                    <div className="skeleton-badge skeleton-pulse" />
                    <div className="skeleton-text skeleton-pulse" />
                </div>
            ))}

            {/* Commit Area Skeleton */}
            <div className="commit-section" style={{ borderTop: 'none', paddingTop: 0 }}>
                <div className="skeleton-editor skeleton-pulse" />
                <div className="skeleton-button skeleton-pulse" />
            </div>
        </div>
    );

    return (
        <div className="github-panel card">
            {/* Repo Picker */}
            <RepoPicker onRefresh={hasDiffs ? handleFetchDiff : undefined} />

            {/* Diff Section */}
            {selectedRepo && (
                <div className="github-diff-section">
                    {diffLoading ? (
                        <SkeletonDiffLoader />
                    ) : !hasDiffs ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1rem' }}>
                            <button
                                className="primary-button"
                                onClick={handleFetchDiff}
                                disabled={!initialContent}
                            >
                                {t('github.actions.fetchDiff')}
                            </button>

                            {hasCheckedDiff && !error && (
                                <div className="success-message" style={{ marginTop: '0.5rem' }}>
                                    {t('github.status.upToDate')}
                                </div>
                            )}
                        </div>
                    ) : null}

                    {error && <div className="error-message">{error}</div>}
                    {revertSuccess && <div className="success-message">{revertSuccess}</div>}

                    {!diffLoading && diffs.length > 0 && (
                        <>
                            <div className="toolbar" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
                            </div>

                            <DiffViewer diffs={diffs} onFileSelect={setSelectedPaths} />

                            <div className="commit-section">
                                <CommitMessageEditor
                                    onCommitMessageChange={(msg, valid) => {
                                        setCommitMessage(msg);
                                        setIsCommitValid(valid);
                                    }}
                                    suggestedScope={suggestedScope}
                                />
                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'center', alignItems: 'center' }}>

                                    <button
                                        className="primary-button push-button"
                                        onClick={handlePush}
                                        disabled={pushLoading || !isCommitValid || selectedPaths.length === 0}
                                    >
                                        {pushLoading ? t('github.actions.pushing') : t('github.actions.pushFiles', { count: selectedPaths.length })}
                                    </button>

                                    <button
                                        className="secondary-button"
                                        onClick={handleRevert}
                                        disabled={revertLoading || diffLoading || !canRevert}
                                        title={!canRevert ? t('github.warnings.selectScriptFilesToRevert') : ""}
                                        style={{
                                            borderColor: canRevert ? '#d73a49' : 'var(--border-color)',
                                            color: canRevert ? '#d73a49' : 'var(--text-muted)',
                                            opacity: canRevert ? 1 : 0.6,
                                            cursor: canRevert ? 'pointer' : 'not-allowed',
                                            marginLeft: '0.5rem'
                                        }}
                                    >
                                        {revertLoading ? t('common.loading') : t('github.actions.revert')}
                                    </button>
                                </div>
                                {pushStatus && (
                                    <div className={`push-status ${pushStatus.failed > 0 ? 'partial' : 'success'}`} style={{ marginTop: '0.5rem', textAlign: 'right' }}>
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
