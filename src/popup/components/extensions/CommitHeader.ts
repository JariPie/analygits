import { Node, mergeAttributes } from '@tiptap/core';


export const CommitHeader = Node.create({
    name: 'commitHeader',
    group: 'block',
    // Strictly enforce the structure: Type, optional Scope, then Summary.
    // We might need to adjust this content model if it proves too rigid for typing, but
    // "Invalid State Is Impossible" suggests strictness is good.
    content: 'commitType commitScope? commitSummary',

    // Ensure it's the first thing in the doc (handled by Document schema usually, but this helps)
    defining: true,
    isolating: true,

    addOptions() {
        return {
            HTMLAttributes: {},
        };
    },

    addAttributes() {
        return {
            class: {
                default: 'commit-header',
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'div.commit-header',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
    },

    addKeyboardShortcuts() {
        return {
            Enter: () => {
                const doc = this.editor.state.doc;
                let bodyPos = -1;

                doc.descendants((node, pos) => {
                    if (node.type.name === 'commitBody') {
                        bodyPos = pos;
                        return false;
                    }
                });

                if (bodyPos !== -1) {
                    // Body exists, move focus to inside it (start of first paragraph)
                    // The body content starts at bodyPos + 1
                    return this.editor.chain().focus(bodyPos + 2).run();
                } else {
                    // Insert Body. 
                    // Schema: Header Body? Footer*
                    // We need to insert after Header (which is basically at doc position 0 usually, size is header.nodeSize).
                    // Or just append? If footers exist, strict schema requires Body before Footers.
                    // Tiptap's insertContent usually handles schema compliance if possible, but strict order is tricky.
                    // Let's find the insertion point. Header is at 0.
                    const headerSize = doc.child(0).nodeSize;

                    return this.editor.chain()
                        .insertContentAt(headerSize, {
                            type: 'commitBody',
                            content: [{ type: 'paragraph' }]
                        })
                        .focus(headerSize + 2) // Focus inside the new paragraph
                        .run();
                }
            },
        };
    },
});
