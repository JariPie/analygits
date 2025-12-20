import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDiffFetching } from '../../src/popup/hooks/useDiffFetching';
import type { ParsedStoryContent } from '../../src/popup/utils/sacParser';

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

vi.mock('../../src/popup/services/githubService', () => ({
    getRepoTree: vi.fn().mockResolvedValue([]),
    getFileContent: vi.fn().mockResolvedValue('content')
}));

vi.mock('../../src/diff/adapter', () => ({
    buildVirtualStoryTree: vi.fn().mockReturnValue(new Map())
}));

vi.mock('../../src/diff/diff', () => ({
    diffTrees: vi.fn().mockReturnValue([])
}));

vi.mock('../../src/popup/utils/scopeCalculator', () => ({
    getDeepestSharedScope: vi.fn().mockReturnValue(undefined)
}));

describe('useDiffFetching', () => {
    const mockInitialContent: ParsedStoryContent = {
        id: 'story-123',
        name: 'Test Story',
        description: 'Test description',
        content: {},
        pages: [],
        globalVars: [],
        scriptObjects: [],
        events: []
    };

    const mockOnFetchLatest = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        mockOnFetchLatest.mockResolvedValue(mockInitialContent);
    });

    it('should initialize with empty state', () => {
        const { result } = renderHook(() => useDiffFetching({
            initialContent: mockInitialContent,
            onFetchLatest: mockOnFetchLatest
        }));

        expect(result.current.diffs).toEqual([]);
        expect(result.current.selectedPaths).toEqual([]);
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBeNull();
        expect(result.current.hasCheckedDiff).toBe(false);
    });

    it('should have undefined suggestedScope initially', () => {
        const { result } = renderHook(() => useDiffFetching({
            initialContent: mockInitialContent,
            onFetchLatest: mockOnFetchLatest
        }));

        expect(result.current.suggestedScope).toBeUndefined();
    });

    it('should expose setSelectedPaths function', () => {
        const { result } = renderHook(() => useDiffFetching({
            initialContent: mockInitialContent,
            onFetchLatest: mockOnFetchLatest
        }));

        expect(typeof result.current.setSelectedPaths).toBe('function');
    });

    it('should expose setError function', () => {
        const { result } = renderHook(() => useDiffFetching({
            initialContent: mockInitialContent,
            onFetchLatest: mockOnFetchLatest
        }));

        expect(typeof result.current.setError).toBe('function');
    });

    it('should expose fetchDiff function', () => {
        const { result } = renderHook(() => useDiffFetching({
            initialContent: mockInitialContent,
            onFetchLatest: mockOnFetchLatest
        }));

        expect(typeof result.current.fetchDiff).toBe('function');
    });

    it('should set error when initialContent is null', async () => {
        const { result } = renderHook(() => useDiffFetching({
            initialContent: null,
            onFetchLatest: mockOnFetchLatest
        }));

        await act(async () => {
            await result.current.fetchDiff();
        });

        expect(result.current.error).toBe('github.errors.fetchFirst');
    });

    it('should call onFetchLatest when fetching diffs', async () => {
        const { result } = renderHook(() => useDiffFetching({
            initialContent: mockInitialContent,
            onFetchLatest: mockOnFetchLatest
        }));

        await act(async () => {
            await result.current.fetchDiff();
        });

        expect(mockOnFetchLatest).toHaveBeenCalled();
    });

    it('should have fetchDiff that updates loading state', async () => {
        // Testing that loading goes through true state during fetch
        // This is an async operation, so we test the final state
        const { result } = renderHook(() => useDiffFetching({
            initialContent: mockInitialContent,
            onFetchLatest: mockOnFetchLatest
        }));

        // Initial loading should be false
        expect(result.current.loading).toBe(false);

        // After fetch completes, loading should be false
        await act(async () => {
            await result.current.fetchDiff();
        });

        expect(result.current.loading).toBe(false);
    });

    it('should set loading to false after fetch completes', async () => {
        const { result } = renderHook(() => useDiffFetching({
            initialContent: mockInitialContent,
            onFetchLatest: mockOnFetchLatest
        }));

        await act(async () => {
            await result.current.fetchDiff();
        });

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });
    });

    it('should set error when onFetchLatest returns null', async () => {
        mockOnFetchLatest.mockResolvedValue(null);

        const { result } = renderHook(() => useDiffFetching({
            initialContent: mockInitialContent,
            onFetchLatest: mockOnFetchLatest
        }));

        await act(async () => {
            await result.current.fetchDiff();
        });

        expect(result.current.error).toBeTruthy();
    });

    it('should update selectedPaths via setSelectedPaths', async () => {
        const { result } = renderHook(() => useDiffFetching({
            initialContent: mockInitialContent,
            onFetchLatest: mockOnFetchLatest
        }));

        await act(async () => {
            result.current.setSelectedPaths(['path1', 'path2']);
        });

        expect(result.current.selectedPaths).toEqual(['path1', 'path2']);
    });

    it('should update error via setError', async () => {
        const { result } = renderHook(() => useDiffFetching({
            initialContent: mockInitialContent,
            onFetchLatest: mockOnFetchLatest
        }));

        await act(async () => {
            result.current.setError('Custom error message');
        });

        expect(result.current.error).toBe('Custom error message');
    });
});
