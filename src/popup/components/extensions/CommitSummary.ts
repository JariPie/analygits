import { Node, mergeAttributes } from '@tiptap/core';

export const CommitSummary = Node.create({
    name: 'commitSummary',
    group: 'inline',
    inline: true,
    content: 'text*',

    addAttributes() {
        return {
            class: {
                default: 'commit-summary',
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'span.commit-summary',
            },
        ];
    },

    renderHTML({ node, HTMLAttributes }) {
        const isEmpty = node.textContent.length === 0;
        return [
            'span',
            mergeAttributes(HTMLAttributes, {
                'data-placeholder': 'short summary',
                class: `commit-summary ${isEmpty ? 'is-empty' : ''}`,
            }),
            0
        ];
    },

    addKeyboardShortcuts() {
        return {
            'Shift-Tab': () => {
                // Move back to scope
                const doc = this.editor.state.doc;
                let scopePos = -1;

                doc.descendants((node, pos) => {
                    if (node.type.name === 'commitScope') {
                        scopePos = pos;
                        return false;
                    }
                });

                if (scopePos !== -1) {
                    return this.editor.chain().focus(scopePos + 1).run();
                }
                return false;
            },
        };
    },
});

