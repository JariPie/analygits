import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const CommitTypeEmptyPluginKey = new PluginKey('commitTypeEmpty');

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

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: CommitTypeEmptyPluginKey,
                props: {
                    decorations: (state) => {
                        const decorations: Decoration[] = [];

                        state.doc.descendants((node, pos) => {
                            if (node.type.name === 'commitType') {
                                const isEmpty = node.textContent.length === 0;
                                if (isEmpty) {
                                    decorations.push(
                                        Decoration.node(pos, pos + node.nodeSize, {
                                            class: 'is-empty',
                                        })
                                    );
                                }
                            }
                        });

                        return DecorationSet.create(state.doc, decorations);
                    },
                },
            }),
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
