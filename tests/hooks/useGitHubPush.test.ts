import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGitHubPush } from '../../src/popup/hooks/useGitHubPush';
import type { FileDiff } from '../../src/popup/services/github';

// Mock dependencies
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key
    })
}));

const mockGetAccessToken = vi.fn().mockResolvedValue('mock-token');
const mockSelectedRepo = { id: 1, owner: { login: 'owner' }, name: 'repo' };

vi.mock('../../src/popup/context/AuthContext', () => ({
    useAuth: () => ({
        getAccessToken: mockGetAccessToken,
        selectedRepo: mockSelectedRepo,
        branch: 'main'
    })
}));

const mockPushChanges = vi.fn();
vi.mock('../../src/popup/services/github', () => ({
    pushChanges: (...args: unknown[]) => mockPushChanges(...args)
}));

describe('useGitHubPush', () => {
    const mockDiffs: FileDiff[] = [
        { path: 'file1.js', status: 'modified', oldContent: 'old', newContent: 'new' },
        { path: 'file2.js', status: 'added', newContent: 'added content' }
    ];
    const mockSelectedPaths = ['file1.js', 'file2.js'];
    const mockOnPushComplete = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        mockPushChanges.mockResolvedValue(undefined);
        mockOnPushComplete.mockResolvedValue(undefined);
    });

    it('should initialize with default state', () => {
        const { result } = renderHook(() => useGitHubPush({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            onPushComplete: mockOnPushComplete
        }));

        expect(result.current.loading).toBe(false);
        expect(result.current.status).toBeNull();
        expect(result.current.commitMessage).toBe('');
        expect(result.current.isCommitValid).toBe(false);
    });

    it('should expose setCommitMessage function', () => {
        const { result } = renderHook(() => useGitHubPush({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            onPushComplete: mockOnPushComplete
        }));

        expect(typeof result.current.setCommitMessage).toBe('function');
    });

    it('should expose setIsCommitValid function', () => {
        const { result } = renderHook(() => useGitHubPush({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            onPushComplete: mockOnPushComplete
        }));

        expect(typeof result.current.setIsCommitValid).toBe('function');
    });

    it('should expose resetStatus function', () => {
        const { result } = renderHook(() => useGitHubPush({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            onPushComplete: mockOnPushComplete
        }));

        expect(typeof result.current.resetStatus).toBe('function');
    });

    it('should update commitMessage via setCommitMessage', async () => {
        const { result } = renderHook(() => useGitHubPush({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            onPushComplete: mockOnPushComplete
        }));

        await act(async () => {
            result.current.setCommitMessage('feat: add new feature');
        });

        expect(result.current.commitMessage).toBe('feat: add new feature');
    });

    it('should update isCommitValid via setIsCommitValid', async () => {
        const { result } = renderHook(() => useGitHubPush({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            onPushComplete: mockOnPushComplete
        }));

        await act(async () => {
            result.current.setIsCommitValid(true);
        });

        expect(result.current.isCommitValid).toBe(true);
    });

    it('should throw error if commit message is invalid', async () => {
        const { result } = renderHook(() => useGitHubPush({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            onPushComplete: mockOnPushComplete
        }));

        await expect(async () => {
            await act(async () => {
                await result.current.push();
            });
        }).rejects.toThrow();
    });

    it('should call pushChanges with correct parameters on valid push', async () => {
        const { result } = renderHook(() => useGitHubPush({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            onPushComplete: mockOnPushComplete
        }));

        await act(async () => {
            result.current.setCommitMessage('feat: test commit');
            result.current.setIsCommitValid(true);
        });

        await act(async () => {
            await result.current.push();
        });

        expect(mockPushChanges).toHaveBeenCalledWith(
            'mock-token',
            'owner',
            'repo',
            'main',
            'feat: test commit',
            mockDiffs,
            mockSelectedPaths
        );
    });

    it('should set success status after successful push', async () => {
        const { result } = renderHook(() => useGitHubPush({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            onPushComplete: mockOnPushComplete
        }));

        await act(async () => {
            result.current.setCommitMessage('feat: test commit');
            result.current.setIsCommitValid(true);
        });

        await act(async () => {
            await result.current.push();
        });

        expect(result.current.status).toEqual({
            success: mockSelectedPaths.length,
            failed: 0
        });
    });

    it('should call onPushComplete after successful push', async () => {
        const { result } = renderHook(() => useGitHubPush({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            onPushComplete: mockOnPushComplete
        }));

        await act(async () => {
            result.current.setCommitMessage('feat: test commit');
            result.current.setIsCommitValid(true);
        });

        await act(async () => {
            await result.current.push();
        });

        expect(mockOnPushComplete).toHaveBeenCalled();
    });

    it('should set failure status on push error', async () => {
        mockPushChanges.mockRejectedValue(new Error('Push failed'));

        const { result } = renderHook(() => useGitHubPush({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            onPushComplete: mockOnPushComplete
        }));

        await act(async () => {
            result.current.setCommitMessage('feat: test commit');
            result.current.setIsCommitValid(true);
        });

        // Push should throw, but we catch it to check the state
        await act(async () => {
            try {
                await result.current.push();
            } catch {
                // Expected error
            }
        });

        expect(result.current.status).toEqual({
            success: 0,
            failed: mockSelectedPaths.length
        });
    });

    it('should reset status via resetStatus function', async () => {
        const { result } = renderHook(() => useGitHubPush({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            onPushComplete: mockOnPushComplete
        }));

        // First, set some status
        await act(async () => {
            result.current.setCommitMessage('feat: test commit');
            result.current.setIsCommitValid(true);
        });

        await act(async () => {
            await result.current.push();
        });

        expect(result.current.status).not.toBeNull();

        // Now reset
        await act(async () => {
            result.current.resetStatus();
        });

        expect(result.current.status).toBeNull();
    });

    it('should set loading false after push completes', async () => {
        const { result } = renderHook(() => useGitHubPush({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            onPushComplete: mockOnPushComplete
        }));

        await act(async () => {
            result.current.setCommitMessage('feat: test commit');
            result.current.setIsCommitValid(true);
        });

        await act(async () => {
            await result.current.push();
        });

        expect(result.current.loading).toBe(false);
    });

    it('should not push when diffs are empty', async () => {
        const { result } = renderHook(() => useGitHubPush({
            diffs: [],
            selectedPaths: [],
            onPushComplete: mockOnPushComplete
        }));

        await act(async () => {
            result.current.setCommitMessage('feat: test commit');
            result.current.setIsCommitValid(true);
        });

        await act(async () => {
            await result.current.push();
        });

        expect(mockPushChanges).not.toHaveBeenCalled();
    });
});
