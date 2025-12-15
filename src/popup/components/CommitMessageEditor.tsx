import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';

interface CommitMessageEditorProps {
    onCommitMessageChange: (message: { title: string; body: string }) => void;
    initialTitle?: string;
    initialBody?: string;
}

const CommitMessageEditor: React.FC<CommitMessageEditorProps> = ({
    onCommitMessageChange,
    initialTitle = '',
    initialBody = '',
}) => {
    const titleEditor = useEditor({
        extensions: [
            StarterKit.configure({
                // Disable features not needed for a single-line title
                heading: false,
                bulletList: false,
                orderedList: false,
                blockquote: false,
                codeBlock: false,
                horizontalRule: false,
            }),
            Placeholder.configure({
                placeholder: 'Commit title (required)',
            }),
        ],
        content: initialTitle ? `<p>${initialTitle}</p>` : '',
        onUpdate: ({ editor }) => {
            const title = editor.getText().trim();
            const body = bodyEditor?.getText().trim() || '';
            onCommitMessageChange({ title, body });
        },
    });

    const bodyEditor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: false,
            }),
            Placeholder.configure({
                placeholder: 'Optional extended description...',
            }),
        ],
        content: initialBody ? `<p>${initialBody}</p>` : '',
        onUpdate: ({ editor }) => {
            const title = titleEditor?.getText().trim() || '';
            const body = editor.getText().trim();
            onCommitMessageChange({ title, body });
        },
    });

    return (
        <div className="commit-message-editor">
            <div className="commit-title-wrapper">
                <label htmlFor="commit-title">Commit Title</label>
                <EditorContent
                    editor={titleEditor}
                    className="commit-title-editor tiptap-editor"
                />
            </div>

            <div className="commit-body-wrapper">
                <label htmlFor="commit-body">Description (optional)</label>
                <EditorContent
                    editor={bodyEditor}
                    className="commit-body-editor tiptap-editor"
                />
            </div>
        </div>
    );
};

// --- Utility: Convert Commit Message to String ---

export function formatCommitMessage(title: string, body: string): string {
    if (!title.trim()) {
        throw new Error('Commit title is required');
    }

    if (body.trim()) {
        return `${title.trim()}\n\n${body.trim()}`;
    }

    return title.trim();
}

export default CommitMessageEditor;
