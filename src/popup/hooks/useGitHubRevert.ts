import { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { type FileDiff } from '../services/githubService';
import type { ParsedStoryContent } from '../utils/sacParser';
import { getContent, updateContent, extractStoryContent } from '../../sac/sacApi';
import { parseGitHubScriptPath, patchStoryContentWithGitHubFile, removeContentFromStory } from '../../sac/revertPatch';
import { devLog, devError } from '../../utils/errorHandler';

interface UseGitHubRevertParams {
    diffs: FileDiff[];
    selectedPaths: string[];
    initialContent: ParsedStoryContent | null;
    onRevertComplete: () => Promise<void>;
}

interface UseGitHubRevertResult {
    loading: boolean;
    success: string | null;
    canRevert: boolean;
    revert: () => Promise<void>;
    resetSuccess: () => void;
}

/**
 * Custom hook for reverting SAC content to GitHub version.
 */
export function useGitHubRevert({
    diffs,
    selectedPaths,
    initialContent,
    onRevertComplete,
}: UseGitHubRevertParams): UseGitHubRevertResult {
    const { t } = useTranslation();

    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);

    // Reset on content changes
    useEffect(() => {
        setSuccess(null);
    }, [initialContent?.id]);

    const resetSuccess = useCallback(() => {
        setSuccess(null);
    }, []);

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

    const revert = useCallback(async () => {
        if (selectedPaths.length === 0) return;

        // Confirmation
        if (!window.confirm(t('github.warnings.revertConfirm', { path: `${selectedPaths.length} file(s)` }))) {
            return;
        }

        setLoading(true);
        setSuccess(null);

        try {
            // 1. Fetch current story content from SAC
            const storyId = initialContent?.id;
            if (!storyId) throw new Error("Missing Story ID");

            const { resource } = await getContent(storyId);

            // 2. Extract the content object
            const baseContent = extractStoryContent(resource.cdata);
            if (!baseContent) {
                devError('useGitHubRevert', 'Could not extract content. cdata structure:', {
                    keys: Object.keys(resource.cdata || {}),
                    hasContent: !!resource.cdata?.content,
                    hasContentOptimized: !!resource.cdata?.contentOptimized
                });
                throw new Error("Could not find story content in resource.cdata");
            }

            // Get version counter for optimistic locking
            const localVer = resource.updateCounter ?? resource.cdata?.updateCounter ?? 1;
            devLog('useGitHubRevert', `Using localVer: ${localVer}`);

            // Validate structure before patching
            if (!baseContent.version || !Array.isArray(baseContent.entities)) {
                devError('useGitHubRevert', 'Unexpected content structure:', {
                    hasVersion: !!baseContent.version,
                    entitiesType: typeof baseContent.entities,
                    isArray: Array.isArray(baseContent.entities),
                    keys: Object.keys(baseContent)
                });
                throw new Error("Unexpected story content structure - missing version or entities array");
            }

            devLog('useGitHubRevert', `Fetched content with version: ${baseContent.version}, entities count: ${baseContent.entities.length}`);

            // 3. Patch Loop - patch the content object iteratively
            let patchedContent = baseContent;
            for (const path of selectedPaths) {
                const diff = diffs.find(d => d.path === path);
                if (!diff) continue;

                const target = parseGitHubScriptPath(path);
                if (!target) {
                    throw new Error(`File ${path} is not a supported script.`);
                }

                devLog('useGitHubRevert', `Processing ${path} with status: ${diff.status}`);

                if (diff.status === 'added') {
                    // File exists in SAC but not in GitHub - REMOVE it
                    devLog('useGitHubRevert', `Removing ${path} (was added locally, doesn't exist in GitHub)`);
                    patchedContent = removeContentFromStory({
                        storyContent: patchedContent,
                        githubPath: path
                    });
                } else if (diff.status === 'deleted') {
                    // File exists in GitHub but not in SAC - RESTORE it
                    if (!diff.oldContent) {
                        throw new Error(`Cannot restore ${path} - missing GitHub content.`);
                    }
                    devLog('useGitHubRevert', `Restoring ${path} from GitHub (was deleted locally)`);
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
                    devLog('useGitHubRevert', `Reverting ${path} to GitHub version`);
                    devLog('useGitHubRevert', `  SAC length: ${diff.newContent?.length ?? 0}, GitHub length: ${diff.oldContent.length}`);
                    patchedContent = patchStoryContentWithGitHubFile({
                        storyContent: patchedContent,
                        githubPath: path,
                        githubFileText: diff.oldContent
                    });
                }
            }

            // 4. Update SAC with the patched content
            devLog('useGitHubRevert', 'Sending patched content to SAC...');

            await updateContent({
                resourceId: resource.resourceId,
                name: resource.name,
                description: resource.description ?? "",
                content: patchedContent,
                localVer: localVer
            });

            setSuccess(t('github.status.reverted'));

            // 5. Refresh to show updated status
            await onRevertComplete();

        } catch (error: unknown) {
            devError('useGitHubRevert', 'Revert failed:', error);
            throw error; // Re-throw for caller to handle
        } finally {
            setLoading(false);
        }
    }, [selectedPaths, diffs, initialContent, t, onRevertComplete]);

    return {
        loading,
        success,
        canRevert,
        revert,
        resetSuccess,
    };
}
