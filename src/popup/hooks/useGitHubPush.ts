import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { type FileDiff, pushChanges } from '../services/github';

interface UseGitHubPushParams {
    diffs: FileDiff[];
    selectedPaths: string[];
    onPushComplete: () => Promise<void>;
}

interface UseGitHubPushResult {
    loading: boolean;
    status: { success: number; failed: number } | null;
    commitMessage: string;
    setCommitMessage: React.Dispatch<React.SetStateAction<string>>;
    isCommitValid: boolean;
    setIsCommitValid: React.Dispatch<React.SetStateAction<boolean>>;
    push: () => Promise<void>;
    resetStatus: () => void;
}

/**
 * Custom hook for pushing changes to GitHub.
 */
export function useGitHubPush({
    diffs,
    selectedPaths,
    onPushComplete,
}: UseGitHubPushParams): UseGitHubPushResult {
    const { t } = useTranslation();
    const { getAccessToken, selectedRepo, branch } = useAuth();

    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<{ success: number; failed: number } | null>(null);
    const [commitMessage, setCommitMessage] = useState('');
    const [isCommitValid, setIsCommitValid] = useState(false);

    // Reset status when repo changes
    useEffect(() => {
        setStatus(null);
    }, [selectedRepo?.id]);

    const resetStatus = useCallback(() => {
        setStatus(null);
    }, []);

    const push = useCallback(async () => {
        if (!selectedRepo || diffs.length === 0) return;

        if (!commitMessage || !isCommitValid) {
            throw new Error(t('github.errors.invalidCommit'));
        }

        setLoading(true);

        try {
            const token = await getAccessToken();

            await pushChanges(
                token,
                selectedRepo.owner.login,
                selectedRepo.name,
                branch,
                commitMessage,
                diffs,
                selectedPaths
            );

            setStatus({ success: selectedPaths.length, failed: 0 });

            // Refresh diffs after push
            await onPushComplete();

        } catch (error: unknown) {
            console.error('[useGitHubPush] Push failed:', error);
            setStatus({ success: 0, failed: selectedPaths.length });
            throw error;
        } finally {
            setLoading(false);
        }
    }, [selectedRepo, diffs, selectedPaths, commitMessage, isCommitValid, branch, getAccessToken, onPushComplete, t]);

    return {
        loading,
        status,
        commitMessage,
        setCommitMessage,
        isCommitValid,
        setIsCommitValid,
        push,
        resetStatus,
    };
}
