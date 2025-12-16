import { Node } from '@tiptap/core'; // Extend the base Node, we'll replace 'doc'

export const CommitDocument = Node.create({
    name: 'doc', // Overwrite the default doc
    topNode: true,
    // Strict schema: Header first, then optional Body, then optional Footers
    content: 'commitHeader commitBody? commitFooter*',

    // We don't need to define renderHTML for doc usually, but valid to keep it clean
});
