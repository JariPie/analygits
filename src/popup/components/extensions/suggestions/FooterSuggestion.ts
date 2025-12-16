import { Extension } from '@tiptap/core';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import type { ResolvedPos } from '@tiptap/pm/model';
import { FOOTER_TEMPLATES } from './constants';
import { createSuggestionRenderer } from './suggestionRenderer';
import type { SuggestionItem } from './SuggestionDropdown';

// Unique plugin key for footer suggestions
const FooterSuggestionPluginKey = new PluginKey('footerSuggestion');

/**
 * Get filtered footer items for the suggestion dropdown
 */
function getFooterItems(query: string): SuggestionItem[] {
    const lowerQuery = query.toLowerCase();
    if (!lowerQuery) {
        return FOOTER_TEMPLATES.map(t => ({
            label: t.label,
            description: t.description,
        }));
    }

    return FOOTER_TEMPLATES
        .filter(t => t.label.toLowerCase().startsWith(lowerQuery))
        .map(t => ({
            label: t.label,
            description: t.description,
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
 * Custom suggestion match finder for commitFooter nodes
 */
function findFooterSuggestionMatch(config: TriggerConfig) {
    const { $position } = config;

    // Check if we're inside a commitFooter node
    let inFooterNode = false;
    let footerText = '';
    let footerNodeStart = -1;

    for (let depth = $position.depth; depth >= 0; depth--) {
        const node = $position.node(depth);
        if (node.type.name === 'commitFooter') {
            inFooterNode = true;
            footerText = node.textContent;
            footerNodeStart = $position.start(depth);
            break;
        }
    }

    if (!inFooterNode) return null;

    // Show suggestions for known prefixes or empty footer
    const lowerText = footerText.toLowerCase();
    const hasMatch = FOOTER_TEMPLATES.some(t =>
        t.label.toLowerCase().startsWith(lowerText)
    );

    // Don't show if text doesn't match any template and isn't empty
    if (footerText.length > 0 && !hasMatch) {
        return null;
    }

    return {
        range: {
            from: footerNodeStart,
            to: footerNodeStart + footerText.length,
        },
        query: footerText,
        text: footerText,
    };
}

export const FooterSuggestion = Extension.create({
    name: 'footerSuggestion',

    addOptions() {
        return {
            suggestion: {
                pluginKey: FooterSuggestionPluginKey,
                char: '',
                allowSpaces: true,
                command: ({ editor, range, props }) => {
                    const template = FOOTER_TEMPLATES.find(t => t.label === props.label);
                    const insertText = template?.insertText || props.label;

                    editor
                        .chain()
                        .focus()
                        .deleteRange(range)
                        .insertContent(insertText)
                        .run();
                },
                items: ({ query }: { query: string }) => getFooterItems(query),
                render: createSuggestionRenderer,
                findSuggestionMatch: findFooterSuggestionMatch,
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
