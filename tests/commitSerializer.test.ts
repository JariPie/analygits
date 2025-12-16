import { describe, it, expect } from 'vitest';
import { serializeCommitMessage, validateCommitMessage } from '../src/popup/utils/commitSerializer';
import type { JSONContent } from '@tiptap/core';

describe('Commit Serializer', () => {
    it('serializes a full commit message correctly', () => {
        const doc: JSONContent = {
            type: 'doc',
            content: [
                {
                    type: 'commitHeader',
                    content: [
                        { type: 'commitType', text: 'feat' },
                        { type: 'commitScope', text: 'auth' },
                        { type: 'commitSummary', text: 'add login' }
                    ]
                },
                {
                    type: 'commitBody',
                    content: [
                        { type: 'paragraph', content: [{ type: 'text', text: 'First paragraph.' }] },
                        { type: 'paragraph', content: [{ type: 'text', text: 'Second paragraph.' }] }
                    ]
                },
                {
                    type: 'commitFooter',
                    content: [{ type: 'text', text: 'Closes #123' }]
                },
                {
                    type: 'commitFooter',
                    content: [{ type: 'text', text: 'Signed-off-by: User' }]
                }
            ]
        };

        const output = serializeCommitMessage(doc);
        expect(output).toBe('feat(auth): add login\n\nFirst paragraph.\n\nSecond paragraph.\n\nCloses #123\nSigned-off-by: User');
    });

    it('serializes header only (without scope)', () => {
        const doc: JSONContent = {
            type: 'doc',
            content: [
                {
                    type: 'commitHeader',
                    content: [
                        { type: 'commitType', text: 'fix' },
                        { type: 'commitSummary', text: 'crash on load' }
                    ]
                }
            ]
        };

        const output = serializeCommitMessage(doc);
        expect(output).toBe('fix: crash on load');
    });

    it('handles missing components gracefully', () => {
        const doc: JSONContent = {
            type: 'doc',
            content: [
                {
                    type: 'commitHeader',
                    content: [
                        { type: 'commitType', text: 'chore' }
                        // No summary
                    ]
                }
            ]
        };
        const output = serializeCommitMessage(doc);
        expect(output).toBe('chore:');
    });
});

describe('Commit Validation', () => {
    it('validates a correct commit', () => {
        const doc: JSONContent = {
            type: 'doc',
            content: [
                {
                    type: 'commitHeader',
                    content: [
                        { type: 'commitType', text: 'docs' },
                        { type: 'commitSummary', text: 'update readme' }
                    ]
                }
            ]
        };
        const result = validateCommitMessage(doc);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('detects missing type', () => {
        const doc: JSONContent = {
            type: 'doc',
            content: [
                {
                    type: 'commitHeader',
                    content: [
                        { type: 'commitSummary', text: 'update readme' }
                    ]
                }
            ]
        };
        const result = validateCommitMessage(doc);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Commit type is required (e.g., feat, fix)');
    });

    it('detects missing summary', () => {
        const doc: JSONContent = {
            type: 'doc',
            content: [
                {
                    type: 'commitHeader',
                    content: [
                        { type: 'commitType', text: 'feat' }
                    ]
                }
            ]
        };
        const result = validateCommitMessage(doc);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Commit summary is required');
    });

    it('warns on long header', () => {
        const doc: JSONContent = {
            type: 'doc',
            content: [
                {
                    type: 'commitHeader',
                    content: [
                        { type: 'commitType', text: 'feat' },
                        { type: 'commitSummary', text: 'this is a very long text that will definitely exceed the fifty character limit causing a validation error' }
                    ]
                }
            ]
        };
        const result = validateCommitMessage(doc);
        expect(result.errors).toContain('Header should be under 50 characters');
    });

    it('warns on body line length', () => {
        const longText = 'a'.repeat(73);
        const doc: JSONContent = {
            type: 'doc',
            content: [
                { type: 'commitHeader', content: [{ type: 'commitType', text: 'a' }, { type: 'commitSummary', text: 'b' }] },
                {
                    type: 'commitBody',
                    content: [
                        { type: 'paragraph', content: [{ type: 'text', text: longText }] }
                    ]
                }
            ]
        };
        const result = validateCommitMessage(doc);
        expect(result.warnings.some(w => w.includes('exceeds 72 characters'))).toBe(true);
    });
});
