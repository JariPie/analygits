import { Node, mergeAttributes } from '@tiptap/core';

export const CommitType = Node.create({
    name: 'commitType',
    group: 'inline',
    inline: true,
    content: 'text*',

    addAttributes() {
        return {
            class: {
                default: 'commit-type',
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'span.commit-type',
            },
        ];
    },

    renderHTML({ node, HTMLAttributes }) {
        const isEmpty = node.textContent.length === 0;
        return [
            'span',
            mergeAttributes(HTMLAttributes, {
                'data-placeholder': 'type',
                class: `commit-type ${isEmpty ? 'is-empty' : ''}`,
            }),
            0
        ];
    },

    addKeyboardShortcuts() {
        return {
            Tab: () => {
                // Move to scope
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

