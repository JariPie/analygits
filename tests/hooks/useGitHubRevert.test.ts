import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGitHubRevert } from '../../src/popup/hooks/useGitHubRevert';
import type { FileDiff } from '../../src/popup/services/githubService';
import type { ParsedStoryContent } from '../../src/popup/utils/sacParser';

// Mock dependencies
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, params?: object) => {
            if (params) return `${key} ${JSON.stringify(params)}`;
            return key;
        }
    })
}));

const mockGetContent = vi.fn();
const mockUpdateContent = vi.fn();
const mockExtractStoryContent = vi.fn();

vi.mock('../../src/sac/sacApi', () => ({
    getContent: (...args: unknown[]) => mockGetContent(...args),
    updateContent: (...args: unknown[]) => mockUpdateContent(...args),
    extractStoryContent: (...args: unknown[]) => mockExtractStoryContent(...args)
}));

const mockParseGitHubScriptPath = vi.fn();
const mockPatchStoryContentWithGitHubFile = vi.fn();
const mockRemoveContentFromStory = vi.fn();

vi.mock('../../src/sac/revertPatch', () => ({
    parseGitHubScriptPath: (...args: unknown[]) => mockParseGitHubScriptPath(...args),
    patchStoryContentWithGitHubFile: (...args: unknown[]) => mockPatchStoryContentWithGitHubFile(...args),
    removeContentFromStory: (...args: unknown[]) => mockRemoveContentFromStory(...args)
}));

vi.mock('../../src/utils/errorHandler', () => ({
    devLog: vi.fn(),
    devError: vi.fn()
}));

// Mock window.confirm
const originalConfirm = window.confirm;

describe('useGitHubRevert', () => {
    const mockStoryContent = {
        version: '1.0',
        entities: []
    };

    const mockResource = {
        resourceId: 'res-123',
        name: 'Test Story',
        description: 'Test description',
        updateCounter: 5,
        cdata: {
            content: mockStoryContent
        }
    };

    const mockDiffs: FileDiff[] = [
        {
            path: 'stories/Test/scripts/widgets/Button_1/onClick.js',
            status: 'modified',
            oldContent: 'old code',
            newContent: 'new code'
        },
        {
            path: 'stories/Test/scripts/widgets/Button_2/onClick.js',
            status: 'added',
            newContent: 'added code'
        }
    ];

    const mockSelectedPaths = ['stories/Test/scripts/widgets/Button_1/onClick.js'];

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

    const mockOnRevertComplete = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn().mockReturnValue(true);
        mockGetContent.mockResolvedValue({ resource: mockResource });
        mockExtractStoryContent.mockReturnValue(mockStoryContent);
        mockUpdateContent.mockResolvedValue(undefined);
        mockParseGitHubScriptPath.mockReturnValue({ storyName: 'Test', widgetId: 'Button_1', eventName: 'onClick' });
        mockPatchStoryContentWithGitHubFile.mockReturnValue(mockStoryContent);
        mockRemoveContentFromStory.mockReturnValue(mockStoryContent);
        mockOnRevertComplete.mockResolvedValue(undefined);
    });

    afterEach(() => {
        window.confirm = originalConfirm;
    });

    it('should initialize with default state', () => {
        const { result } = renderHook(() => useGitHubRevert({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            initialContent: mockInitialContent,
            onRevertComplete: mockOnRevertComplete
        }));

        expect(result.current.loading).toBe(false);
        expect(result.current.success).toBeNull();
    });

    it('should expose revert and resetSuccess functions', () => {
        const { result } = renderHook(() => useGitHubRevert({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            initialContent: mockInitialContent,
            onRevertComplete: mockOnRevertComplete
        }));

        expect(typeof result.current.revert).toBe('function');
        expect(typeof result.current.resetSuccess).toBe('function');
    });

    it('should calculate canRevert as true for revertable paths', () => {
        const { result } = renderHook(() => useGitHubRevert({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            initialContent: mockInitialContent,
            onRevertComplete: mockOnRevertComplete
        }));

        expect(result.current.canRevert).toBe(true);
    });

    it('should calculate canRevert as false for empty selectedPaths', () => {
        const { result } = renderHook(() => useGitHubRevert({
            diffs: mockDiffs,
            selectedPaths: [],
            initialContent: mockInitialContent,
            onRevertComplete: mockOnRevertComplete
        }));

        expect(result.current.canRevert).toBe(false);
    });

    it('should calculate canRevert as false for paths that cannot be parsed', () => {
        mockParseGitHubScriptPath.mockReturnValue(null);

        const { result } = renderHook(() => useGitHubRevert({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            initialContent: mockInitialContent,
            onRevertComplete: mockOnRevertComplete
        }));

        expect(result.current.canRevert).toBe(false);
    });

    it('should show confirmation dialog before reverting', async () => {
        const { result } = renderHook(() => useGitHubRevert({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            initialContent: mockInitialContent,
            onRevertComplete: mockOnRevertComplete
        }));

        await act(async () => {
            await result.current.revert();
        });

        expect(window.confirm).toHaveBeenCalled();
    });

    it('should abort if user cancels confirmation', async () => {
        (window.confirm as ReturnType<typeof vi.fn>).mockReturnValue(false);

        const { result } = renderHook(() => useGitHubRevert({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            initialContent: mockInitialContent,
            onRevertComplete: mockOnRevertComplete
        }));

        await act(async () => {
            await result.current.revert();
        });

        expect(mockGetContent).not.toHaveBeenCalled();
    });

    it('should call getContent with story ID', async () => {
        const { result } = renderHook(() => useGitHubRevert({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            initialContent: mockInitialContent,
            onRevertComplete: mockOnRevertComplete
        }));

        await act(async () => {
            await result.current.revert();
        });

        expect(mockGetContent).toHaveBeenCalledWith('story-123');
    });

    it('should call patchStoryContentWithGitHubFile for modified files', async () => {
        const { result } = renderHook(() => useGitHubRevert({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            initialContent: mockInitialContent,
            onRevertComplete: mockOnRevertComplete
        }));

        await act(async () => {
            await result.current.revert();
        });

        expect(mockPatchStoryContentWithGitHubFile).toHaveBeenCalled();
    });

    it('should call removeContentFromStory for added files', async () => {
        const addedPath = 'stories/Test/scripts/widgets/Button_2/onClick.js';

        const { result } = renderHook(() => useGitHubRevert({
            diffs: mockDiffs,
            selectedPaths: [addedPath],
            initialContent: mockInitialContent,
            onRevertComplete: mockOnRevertComplete
        }));

        await act(async () => {
            await result.current.revert();
        });

        expect(mockRemoveContentFromStory).toHaveBeenCalled();
    });

    it('should call updateContent after patching', async () => {
        const { result } = renderHook(() => useGitHubRevert({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            initialContent: mockInitialContent,
            onRevertComplete: mockOnRevertComplete
        }));

        await act(async () => {
            await result.current.revert();
        });

        expect(mockUpdateContent).toHaveBeenCalledWith({
            resourceId: 'res-123',
            name: 'Test Story',
            description: 'Test description',
            content: mockStoryContent,
            localVer: 5
        });
    });

    it('should set success message after successful revert', async () => {
        const { result } = renderHook(() => useGitHubRevert({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            initialContent: mockInitialContent,
            onRevertComplete: mockOnRevertComplete
        }));

        await act(async () => {
            await result.current.revert();
        });

        expect(result.current.success).toBe('github.status.reverted');
    });

    it('should call onRevertComplete after successful revert', async () => {
        const { result } = renderHook(() => useGitHubRevert({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            initialContent: mockInitialContent,
            onRevertComplete: mockOnRevertComplete
        }));

        await act(async () => {
            await result.current.revert();
        });

        expect(mockOnRevertComplete).toHaveBeenCalled();
    });

    it('should throw on missing story ID', async () => {
        const { result } = renderHook(() => useGitHubRevert({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            initialContent: null,
            onRevertComplete: mockOnRevertComplete
        }));

        await expect(async () => {
            await act(async () => {
                await result.current.revert();
            });
        }).rejects.toThrow('Missing Story ID');
    });

    it('should reset success via resetSuccess function', async () => {
        const { result } = renderHook(() => useGitHubRevert({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            initialContent: mockInitialContent,
            onRevertComplete: mockOnRevertComplete
        }));

        // First, trigger a successful revert
        await act(async () => {
            await result.current.revert();
        });

        expect(result.current.success).toBeTruthy();

        // Now reset
        await act(async () => {
            result.current.resetSuccess();
        });

        expect(result.current.success).toBeNull();
    });

    it('should set loading to false after revert completes', async () => {
        const { result } = renderHook(() => useGitHubRevert({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            initialContent: mockInitialContent,
            onRevertComplete: mockOnRevertComplete
        }));

        await act(async () => {
            await result.current.revert();
        });

        expect(result.current.loading).toBe(false);
    });

    it('should throw when content extraction fails', async () => {
        mockExtractStoryContent.mockReturnValue(null);

        const { result } = renderHook(() => useGitHubRevert({
            diffs: mockDiffs,
            selectedPaths: mockSelectedPaths,
            initialContent: mockInitialContent,
            onRevertComplete: mockOnRevertComplete
        }));

        await expect(async () => {
            await act(async () => {
                await result.current.revert();
            });
        }).rejects.toThrow();
    });

    it('should not revert when selectedPaths is empty', async () => {
        const { result } = renderHook(() => useGitHubRevert({
            diffs: mockDiffs,
            selectedPaths: [],
            initialContent: mockInitialContent,
            onRevertComplete: mockOnRevertComplete
        }));

        await act(async () => {
            await result.current.revert();
        });

        expect(mockGetContent).not.toHaveBeenCalled();
    });

    it('should handle deleted files by restoring from oldContent', async () => {
        const deletedDiff: FileDiff[] = [
            {
                path: 'stories/Test/scripts/widgets/Button_1/onClick.js',
                status: 'deleted',
                oldContent: 'deleted code'
            }
        ];

        const { result } = renderHook(() => useGitHubRevert({
            diffs: deletedDiff,
            selectedPaths: ['stories/Test/scripts/widgets/Button_1/onClick.js'],
            initialContent: mockInitialContent,
            onRevertComplete: mockOnRevertComplete
        }));

        await act(async () => {
            await result.current.revert();
        });

        expect(mockPatchStoryContentWithGitHubFile).toHaveBeenCalledWith({
            storyContent: mockStoryContent,
            githubPath: 'stories/Test/scripts/widgets/Button_1/onClick.js',
            githubFileText: 'deleted code'
        });
    });
});
