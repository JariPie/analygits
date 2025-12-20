import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import RepoPicker from './RepoPicker';
import DiffViewer from './DiffViewer';
import CommitMessageEditor from './CommitMessageEditor';
import type { ParsedStoryContent } from '../utils/sacParser';
import { useDiffFetching } from '../hooks/useDiffFetching';
import { useGitHubPush } from '../hooks/useGitHubPush';
import { useGitHubRevert } from '../hooks/useGitHubRevert';

interface GitHubPanelProps {
    parsedContent: ParsedStoryContent | null;
    onFetchLatest: () => Promise<ParsedStoryContent | null>;
}

// --- Skeleton Loader Component ---
const SkeletonDiffLoader: React.FC = () => (
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

const GitHubPanel: React.FC<GitHubPanelProps> = ({ parsedContent: initialContent, onFetchLatest }) => {
    const { t } = useTranslation();
    const { status, selectedRepo } = useAuth();

    // --- Diff Fetching Hook ---
    const {
        diffs,
        selectedPaths,
        setSelectedPaths,
        loading: diffLoading,
        error: diffError,
        setError: setDiffError,
        hasCheckedDiff,
        suggestedScope,
        fetchDiff,
    } = useDiffFetching({ initialContent, onFetchLatest });

    // --- Push Hook ---
    const {
        loading: pushLoading,
        status: pushStatus,
        setCommitMessage,
        isCommitValid,
        setIsCommitValid,
        push,
    } = useGitHubPush({
        diffs,
        selectedPaths,
        onPushComplete: fetchDiff,
    });

    // --- Revert Hook ---
    const {
        loading: revertLoading,
        success: revertSuccess,
        canRevert,
        revert,
    } = useGitHubRevert({
        diffs,
        selectedPaths,
        initialContent,
        onRevertComplete: async () => {
            await onFetchLatest();
            await fetchDiff();
        },
    });

    // Combined error state
    const [localError, setLocalError] = React.useState<string | null>(null);
    const error = diffError || localError;

    // --- Action Handlers ---
    const handlePush = async () => {
        setLocalError(null);
        try {
            await push();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Push failed';
            setLocalError(message);
        }
    };

    const handleRevert = async () => {
        setLocalError(null);
        setDiffError(null);
        try {
            await revert();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Revert failed';
            setLocalError(message);
        }
    };

    if (status !== 'connected') {
        return null;
    }

    const hasDiffs = diffs.length > 0;


    return (
        <div className="github-panel card">
            {/* Repo Picker */}
            <RepoPicker onRefresh={hasDiffs ? fetchDiff : undefined} />

            {/* Diff Section */}
            {selectedRepo && (
                <div className="github-diff-section">
                    {diffLoading ? (
                        <SkeletonDiffLoader />
                    ) : !hasDiffs ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1rem' }}>
                            <button
                                className="primary-button"
                                onClick={fetchDiff}
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
