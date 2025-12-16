import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation();
    const [status, setStatus] = useState<{ isValid: boolean; errors: string[]; warnings: string[] }>({
        isValid: false,
        errors: [],
        warnings: [],
    });

    const lastAutoSuggestScope = React.useRef<string | undefined>(suggestedScope);

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



    // Update scope when suggestedScope changes, BUT only if the user hasn't manually changed it
    useEffect(() => {
        if (!editor || suggestedScope === undefined) return;

        const doc = editor.state.doc;
        let scopeNode: any = null;
        let scopePos = -1;

        doc.descendants((node, pos) => {
            if (node.type.name === 'commitScope') {
                scopeNode = node;
                scopePos = pos;
                return false;
            }
        });

        if (scopeNode && scopePos !== -1) {
            const currentText = scopeNode.textContent;

            // Allow update if:
            // 1. Current text is empty
            // 2. Current text matches what we previously auto-suggested (user hasn't touched it)
            const isUnchangedByUser = currentText === '' || currentText === lastAutoSuggestScope.current;

            if (isUnchangedByUser && currentText !== suggestedScope) {
                // Update the scope content
                editor.chain()
                    .command(({ tr, dispatch }) => {
                        if (dispatch) {
                            // We need to replace the content of the scope node
                            // The scope node starts at scopePos, content at scopePos + 1
                            const start = scopePos + 1;
                            const end = scopePos + scopeNode.nodeSize - 1;

                            tr.insertText(suggestedScope, start, end);
                        }
                        return true;
                    })
                    .run();

                lastAutoSuggestScope.current = suggestedScope;
            }
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
                <span className="editor-title">{t('editor.title')}</span>
                <span className={`validation-status ${status.isValid ? 'valid' : 'invalid'}`}>
                    {status.isValid ? t('editor.status.ready') : t('editor.status.incomplete')}
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
                            {t('editor.validation.strictMode')}{err}
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
                <small dangerouslySetInnerHTML={{ __html: t('editor.help') }} />
            </div>
        </div>
    );
};

export default CommitMessageEditor;
