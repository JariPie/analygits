import { Extension } from '@tiptap/core';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import type { ResolvedPos } from '@tiptap/pm/model';
import { filterScopes } from './scopeStorage';
import { createSuggestionRenderer } from './suggestionRenderer';
import type { SuggestionItem } from './SuggestionDropdown';

// Unique plugin key for scope suggestions
const ScopeSuggestionPluginKey = new PluginKey('scopeSuggestion');

/**
 * Get filtered scope items for the suggestion dropdown
 */
function getScopeItems(query: string): SuggestionItem[] {
    const scopes = filterScopes(query);
    if (scopes.length === 0) {
        if (query.length === 0) {
            return [{ label: '(no recent scopes)', description: 'Type to add one' }];
        }
        return [];
    }
    return scopes.map(scope => ({
        label: scope,
        description: 'Recent',
    }));
}

interface TriggerConfig {
    char: string;
    allowSpaces: boolean;
    allowedPrefixes: string[] | null;
    startOfLine: boolean;
    $position: ResolvedPos;
}

/**
 * Custom suggestion match finder for commitScope nodes
 */
function findScopeSuggestionMatch(config: TriggerConfig) {
    const { $position } = config;

    // Check if we're inside a commitScope node
    let inScopeNode = false;
    let scopeText = '';
    let scopeNodeStart = -1;

    for (let depth = $position.depth; depth >= 0; depth--) {
        const node = $position.node(depth);
        if (node.type.name === 'commitScope') {
            inScopeNode = true;
            scopeText = node.textContent;
            scopeNodeStart = $position.start(depth);
            break;
        }
    }

    if (!inScopeNode) return null;

    return {
        range: {
            from: scopeNodeStart,
            to: scopeNodeStart + scopeText.length,
        },
        query: scopeText,
        text: scopeText,
    };
}

export const ScopeSuggestion = Extension.create({
    name: 'scopeSuggestion',

    addOptions() {
        return {
            suggestion: {
                pluginKey: ScopeSuggestionPluginKey,
                char: '',
                allowSpaces: false,
                command: ({ editor, range, props }) => {
                    // Don't insert the "no recent scopes" placeholder
                    if (props.label.startsWith('(')) return;

                    editor
                        .chain()
                        .focus()
                        .deleteRange(range)
                        .insertContent(props.label)
                        .run();
                },
                items: ({ query }: { query: string }) => getScopeItems(query),
                render: createSuggestionRenderer,
                findSuggestionMatch: findScopeSuggestionMatch,
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
