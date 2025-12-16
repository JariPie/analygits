import { CommitHeader } from './CommitHeader';
import { CommitType } from './CommitType';
import { CommitScope } from './CommitScope';
import { CommitSummary } from './CommitSummary';
import { CommitBody } from './CommitBody';
import { CommitFooter } from './CommitFooter';
import { CommitDocument } from './CommitDocument';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';

export const CommitEditorExtensions = [
    // Override default doc
    CommitDocument,

    // Custom Structs
    CommitHeader,
    CommitType,
    CommitScope,
    CommitSummary,
    CommitBody,
    CommitFooter,

    // Essentials
    StarterKit.configure({
        document: false, // We use our own doc
        heading: false,  // Disable unused nodes
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
    }),

    Placeholder.configure({
        includeChildren: true,
        placeholder: ({ node }) => {
            if (node.type.name === 'commitType') {
                return 'type';
            }
            if (node.type.name === 'commitScope') {
                return 'scope';
            }
            if (node.type.name === 'commitSummary') {
                return 'short summary';
            }
            if (node.type.name === 'paragraph') {
                return 'Commit Body (Extended Description)...';
            }
            if (node.type.name === 'commitFooter') {
                return 'Closes #123';
            }
            return '';
        },
    }),
];
