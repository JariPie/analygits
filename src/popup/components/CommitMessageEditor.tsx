import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { CommitEditorExtensions } from './extensions';
import { serializeCommitMessage, validateCommitMessage } from '../utils/commitSerializer';
import './Editor.css';

interface CommitMessageEditorProps {
    onCommitMessageChange: (message: string, isValid: boolean) => void;
    suggestedScope?: string; // Optional suggestion
}

const CommitMessageEditor: React.FC<CommitMessageEditorProps> = ({
    onCommitMessageChange,
    suggestedScope
}) => {
    const [status, setStatus] = useState<{ isValid: boolean; errors: string[]; warnings: string[] }>({
        isValid: false,
        errors: [],
        warnings: [],
    });

    const editor = useEditor({
        extensions: CommitEditorExtensions,
        content: {
            type: 'doc',
            content: [
                {
                    type: 'commitHeader',
                    content: [
                        {
                            type: 'commitType',
                            content: suggestedScope ? [] : [] // Empty content array for text*
                        },
                        {
                            type: 'commitScope',
                            content: suggestedScope ? [{ type: 'text', text: suggestedScope }] : []
                        },
                        {
                            type: 'commitSummary',
                            content: [] // Empty content array for text*
                        }
                    ]
                },
                {
                    type: 'commitBody',
                    content: [
                        { type: 'paragraph', content: [] }
                    ]
                }
            ]
        },
        onUpdate: ({ editor }) => {
            const json = editor.getJSON();
            const message = serializeCommitMessage(json);
            const validation = validateCommitMessage(json);

            setStatus(validation);
            onCommitMessageChange(message, validation.isValid);
        },
    });

    // Effect to insert scope if provided later (or initially if editor wasn't ready)
    // Note: This is simplified; we might want to only set it if empty.
    useEffect(() => {
        if (editor && suggestedScope) {
            // Find scope node and update it? 
            // For now, allow user to type.
        }
    }, [suggestedScope, editor]);

    // Auto-focus on the type field when editor mounts
    useEffect(() => {
        if (editor && !editor.isFocused) {
            // Slightly longer delay to ensure DOM is fully ready
            const timer = setTimeout(() => {
                // Find the commitType node and focus inside it
                const doc = editor.state.doc;
                let typePos = -1;

                doc.descendants((node, pos) => {
                    if (node.type.name === 'commitType') {
                        typePos = pos;
                        return false;
                    }
                });

                if (typePos !== -1) {
                    editor.chain().focus(typePos + 1).run();
                } else {
                    // Fallback: focus at the start
                    editor.commands.focus('start');
                }
            }, 100);

            return () => clearTimeout(timer);
        }
    }, [editor]);

    if (!editor) {
        return null;
    }

    return (
        <div className="commit-message-editor-container">
            <div className="editor-toolbar">
                <span className="editor-title">Commit Message</span>
                <span className={`validation-status ${status.isValid ? 'valid' : 'invalid'}`}>
                    {status.isValid ? '✅ Ready' : '❌ Incomplete'}
                </span>
            </div>

            <div className="editor-wrapper">
                <EditorContent editor={editor} className="commit-editor-content" />
                <div className="ruler-72" title="72 character line limit guideline" />
            </div>

            {(status.errors.length > 0 || status.warnings.length > 0) && (
                <div className="validation-feedback">
                    {status.errors.map((err, i) => (
                        <div key={`err-${i}`} className="feedback-item error">
                            Using strict mode: {err}
                        </div>
                    ))}
                    {status.warnings.map((warn, i) => (
                        <div key={`warn-${i}`} className="feedback-item warning">
                            ⚠️ {warn}
                        </div>
                    ))}
                </div>
            )}

            <div className="editor-help">
                <small>Type: <code>feat(scope): summary</code> then Enter for body.</small>
            </div>
        </div>
    );
};

export default CommitMessageEditor;
