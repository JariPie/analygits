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
 */
function findTypeSuggestionMatch(config: TriggerConfig) {
    const { $position } = config;

    // Check if we're inside a commitType node by looking at ancestors
    let inTypeNode = false;
    let typeText = '';
    let typeNodeStart = -1;

    // Walk up the tree from current position to find commitType
    for (let depth = $position.depth; depth >= 0; depth--) {
        const node = $position.node(depth);
        if (node.type.name === 'commitType') {
            inTypeNode = true;
            typeText = node.textContent;
            typeNodeStart = $position.start(depth);
            break;
        }
    }

    if (!inTypeNode) return null;

    // Check if typed text could be a commit type prefix
    const lowerText = typeText.toLowerCase();
    const matches = COMMIT_TYPES.filter(t => t.startsWith(lowerText));

    // Show suggestions if:
    // 1. text is empty (show all options)
    // 2. text matches some types but isn't a complete match yet
    const isExactMatch = COMMIT_TYPES.some(t => t === lowerText);
    if (typeText.length > 0 && (matches.length === 0 || isExactMatch)) {
        return null;
    }

    return {
        range: {
            from: typeNodeStart,
            to: typeNodeStart + typeText.length,
        },
        query: typeText,
        text: typeText,
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
