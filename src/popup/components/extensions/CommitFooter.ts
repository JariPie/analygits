import { Node, mergeAttributes } from '@tiptap/core';

export const CommitFooter = Node.create({
    name: 'commitFooter',
    group: 'block',
    content: 'text*', // Text content for the footer line

    addAttributes() {
        return {
            class: {
                default: 'commit-footer',
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'div.commit-footer',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes), 0];
    },
});
