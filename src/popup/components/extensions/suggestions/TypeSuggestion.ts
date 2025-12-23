import { Extension } from '@tiptap/core';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import type { ResolvedPos } from '@tiptap/pm/model';
import { COMMIT_TYPES } from '../constants';
import { createSuggestionRenderer } from './suggestionRenderer';
import type { SuggestionItem } from './SuggestionDropdown';

// Unique plugin key for type suggestions
const TypeSuggestionPluginKey = new PluginKey('typeSuggestion');

/**
 * Get filtered commit type items for the suggestion dropdown
 */
function getTypeItems(query: string): SuggestionItem[] {
    const lowerQuery = query.toLowerCase();

    // If empty query, show all types
    if (!lowerQuery) {
        return COMMIT_TYPES.map(type => ({
            label: type,
            description: getTypeDescription(type),
        }));
    }

    return COMMIT_TYPES
        .filter(type => type.startsWith(lowerQuery))
        .map(type => ({
            label: type,
            description: getTypeDescription(type),
        }));
}

/**
 * Get a brief description for each commit type
 */
function getTypeDescription(type: string): string {
    const descriptions: Record<string, string> = {
        feat: 'New feature',
        fix: 'Bug fix',
        docs: 'Documentation',
        style: 'Formatting',
        refactor: 'Code refactor',
        perf: 'Performance',
        test: 'Tests',
        build: 'Build system',
        ci: 'CI config',
        chore: 'Maintenance',
        revert: 'Revert commit',
    };
    return descriptions[type] || '';
}

interface TriggerConfig {
    char: string;
    allowSpaces: boolean;
    allowedPrefixes: string[] | null;
    startOfLine: boolean;
    $position: ResolvedPos;
}

/**
 * Custom suggestion match finder for commitType nodes.
 * Uses $position to navigate the document instead of editor reference.
 * Only triggers when cursor is actually inside the commitType node.
 */
function findTypeSuggestionMatch(config: TriggerConfig) {
    const { $position } = config;

    // Find the nearest commitType ancestor node
    let commitTypeDepth = -1;
    let typeNodeStart = -1;
    let typeNodeText = '';

    for (let depth = $position.depth; depth >= 0; depth--) {
        const node = $position.node(depth);
        if (node.type.name === 'commitType') {
            commitTypeDepth = depth;
            typeNodeStart = $position.start(depth);
            typeNodeText = node.textContent ?? '';
            break;
        }
    }

    if (commitTypeDepth === -1) return null;

    // Only allow suggestions for a collapsed cursor
    // (optional but prevents weird behavior with selections)
    // If you want to allow selections, remove this.
    // Note: we don't have state here, so we infer via pos only.
    const cursorPos = $position.pos;

    // Compute where the "type" segment ends: before (, :, whitespace
    const typeSegment = typeNodeText.split(/[(:\s]/)[0] ?? '';
    const typeSegmentEnd = typeNodeStart + typeSegment.length;

    // Cursor must be inside the type segment (not in scope/summary)
    // Use >= typeNodeStart to allow cursor at start of empty type segment
    if (cursorPos < typeNodeStart || cursorPos > typeSegmentEnd) {
        return null;
    }

    // Query is what the user has typed up to the cursor (within type segment)
    const queryLen = Math.max(0, Math.min(typeSegment.length, cursorPos - typeNodeStart));
    const query = typeSegment.slice(0, queryLen);

    const lowerQuery = query.toLowerCase();
    const matches = COMMIT_TYPES.filter(t => t.startsWith(lowerQuery));
    const isExactMatch = COMMIT_TYPES.some(t => t.toLowerCase() === lowerQuery);

    // If user typed something but it's either invalid or already exact, stop
    if (query.length > 0 && (matches.length === 0 || isExactMatch)) {
        return null;
    }

    return {
        range: {
            // Replace the whole current type segment when choosing an item
            from: typeNodeStart,
            // Ensure range.to > range.from even when empty, to keep suggestion active
            to: Math.max(typeSegmentEnd, typeNodeStart + 1),
        },
        query,
        text: query.length === 0 ? '\u200b' : query,
    };
}


export const TypeSuggestion = Extension.create({
    name: 'typeSuggestion',

    addOptions() {
        return {
            suggestion: {
                pluginKey: TypeSuggestionPluginKey,
                char: '', // Not used since we have custom findSuggestionMatch
                allowSpaces: false,
                command: ({ editor, range, props }) => {
                    // Delete current text and insert selected type
                    editor
                        .chain()
                        .focus()
                        .deleteRange(range)
                        .insertContent(props.label)
                        .run();
                },
                items: ({ query }: { query: string }) => getTypeItems(query),
                render: createSuggestionRenderer,
                findSuggestionMatch: findTypeSuggestionMatch,
            } as Partial<SuggestionOptions<SuggestionItem>>,
        };
    },

    addProseMirrorPlugins() {
        return [
            Suggestion({
                editor: this.editor,
                ...this.options.suggestion,
            }),
        ];
    },
});
