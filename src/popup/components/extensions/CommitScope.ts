import { Node, mergeAttributes } from '@tiptap/core';

export const CommitScope = Node.create({
    name: 'commitScope',
    group: 'inline',
    inline: true,
    content: 'text*',

    addAttributes() {
        return {
            class: {
                default: 'commit-scope',
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'span.commit-scope',
            },
        ];
    },

    renderHTML({ node, HTMLAttributes }) {
        const isEmpty = node.textContent.length === 0;
        return [
            'span',
            mergeAttributes(HTMLAttributes, {
                'data-placeholder': 'scope',
                class: `commit-scope ${isEmpty ? 'is-empty' : ''}`,
            }),
            0
        ];
    },

    addKeyboardShortcuts() {
        return {
            Tab: () => {
                // Move to summary
                const doc = this.editor.state.doc;
                let summaryPos = -1;

                doc.descendants((node, pos) => {
                    if (node.type.name === 'commitSummary') {
                        summaryPos = pos;
                        return false;
                    }
                });

                if (summaryPos !== -1) {
                    return this.editor.chain().focus(summaryPos + 1).run();
                }
                return false;
            },
            'Shift-Tab': () => {
                // Move back to type
                const doc = this.editor.state.doc;
                let typePos = -1;

                doc.descendants((node, pos) => {
                    if (node.type.name === 'commitType') {
                        typePos = pos;
                        return false;
                    }
                });

                if (typePos !== -1) {
                    return this.editor.chain().focus(typePos + 1).run();
                }
                return false;
            },
        };
    },
});

