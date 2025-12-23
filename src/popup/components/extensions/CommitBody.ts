import { Node, mergeAttributes } from '@tiptap/core';

export const CommitBody = Node.create({
    name: 'commitBody',
    group: 'block',
    content: 'paragraph+', // Allows distinct paragraphs

    addAttributes() {
        return {
            class: {
                default: 'commit-body',
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'div.commit-body',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes), 0];
    },
});
