import React, { useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import RepoPicker from './RepoPicker';
import DiffViewer from './DiffViewer';
import CommitMessageEditor, { formatCommitMessage } from './CommitMessageEditor';
import {
    type FileDiff,
    getRepoTree,
    pushFile,
    deleteFile,
} from '../services/githubService';
import {
    storyToVirtualTree,
    buildRemoteTreeMap,
    computeDiffs,
} from '../utils/fileSystem';
import type { ParsedStoryContent } from '../utils/sacParser';

interface GitHubPanelProps {
    parsedContent: ParsedStoryContent | null;
}

const GitHubPanel: React.FC<GitHubPanelProps> = ({ parsedContent }) => {
    const { status, startLogin, logout, getAccessToken, selectedRepo, branch } = useAuth();

    const [diffs, setDiffs] = useState<FileDiff[]>([]);
    const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
    const [commitMessage, setCommitMessage] = useState({ title: '', body: '' });
    const [diffLoading, setDiffLoading] = useState(false);
    const [pushLoading, setPushLoading] = useState(false);
    const [pushStatus, setPushStatus] = useState<{ success: number; failed: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    // --- Fetch & Diff ---
    const handleFetchDiff = useCallback(async () => {
        if (!parsedContent || !selectedRepo) {
            setError('Please fetch a story and select a repository first.');
            return;
        }

        setDiffLoading(true);
        setError(null);
        setDiffs([]);
        setPushStatus(null);

        try {
            const token = await getAccessToken();

            // Build local tree from SAC content
            const localTree = storyToVirtualTree(parsedContent);

            // Fetch GitHub tree
            const treeItems = await getRepoTree(token, selectedRepo.owner.login, selectedRepo.name, branch);
            const remoteTreeMap = buildRemoteTreeMap(treeItems);

            // Compute diffs
            const computedDiffs = await computeDiffs(
                localTree,
                remoteTreeMap,
                token,
                selectedRepo.owner.login,
                selectedRepo.name
            );

            setDiffs(computedDiffs);
            setSelectedPaths(computedDiffs.map(d => d.path));
        } catch (err: any) {
            setError(err.message);
        } finally {
            setDiffLoading(false);
        }
    }, [parsedContent, selectedRepo, branch, getAccessToken]);

    // --- Push Changes ---
    const handlePush = useCallback(async () => {
        if (!selectedRepo || diffs.length === 0) return;

        const message = formatCommitMessage(commitMessage.title, commitMessage.body);
        if (!message) {
            setError('Commit title is required.');
            return;
        }

        setPushLoading(true);
        setError(null);

        const localTree = storyToVirtualTree(parsedContent!);
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
                            message,
                            diff.sha!,
                            branch
                        );
                    } else {
                        await pushFile(
                            token,
                            selectedRepo.owner.login,
                            selectedRepo.name,
                            diff.path,
                            localTree.get(diff.path) || diff.newContent || '',
                            message,
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
    }, [selectedRepo, diffs, selectedPaths, commitMessage, branch, getAccessToken, parsedContent, handleFetchDiff]);

    // --- Render ---

    return (
        <div className="github-panel card">
            <div className="card-header">
                <h2>GitHub Integration</h2>
            </div>

            {/* Auth Section */}
            <div className="github-auth-section">
                {status === 'idle' && (
                    <button className="primary-button" onClick={startLogin}>
                        Connect GitHub
                    </button>
                )}

                {status === 'polling' && (
                    <div className="polling-status">
                        <span className="spinner"></span>
                        Waiting for GitHub installation...
                    </div>
                )}

                {status === 'connected' && (
                    <div className="connected-status">
                        <span className="status-badge connected">✓ Connected</span>
                        <button className="secondary-button small" onClick={logout}>
                            Disconnect
                        </button>
                    </div>
                )}

                {status === 'error' && (
                    <div className="error-status">
                        <span className="status-badge error">Connection Failed</span>
                        <button className="secondary-button small" onClick={startLogin}>
                            Retry
                        </button>
                    </div>
                )}
            </div>

            {/* Repo Picker */}
            {status === 'connected' && <RepoPicker />}

            {/* Diff Section */}
            {status === 'connected' && selectedRepo && (
                <div className="github-diff-section">
                    <button
                        className="primary-button"
                        onClick={handleFetchDiff}
                        disabled={diffLoading || !parsedContent}
                    >
                        {diffLoading ? 'Loading...' : 'Fetch & Diff'}
                    </button>

                    {error && <div className="error-message">{error}</div>}

                    {diffs.length > 0 && (
                        <>
                            <DiffViewer diffs={diffs} onFileSelect={setSelectedPaths} />

                            <div className="commit-section">
                                <CommitMessageEditor onCommitMessageChange={setCommitMessage} />

                                <button
                                    className="primary-button push-button"
                                    onClick={handlePush}
                                    disabled={pushLoading || !commitMessage.title.trim() || selectedPaths.length === 0}
                                >
                                    {pushLoading ? 'Pushing...' : `Push ${selectedPaths.length} file(s)`}
                                </button>

                                {pushStatus && (
                                    <div className={`push-status ${pushStatus.failed > 0 ? 'partial' : 'success'}`}>
                                        {pushStatus.success} succeeded, {pushStatus.failed} failed
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
