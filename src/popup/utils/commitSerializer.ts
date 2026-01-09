import type { JSONContent } from '@tiptap/core';

export interface CommitValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Extracts text content from a TipTap node.
 * Text can be in node.text (for text nodes) or in node.content (for nodes with text* content).
 */
function getNodeText(node: JSONContent | undefined): string {
    if (!node) return '';

    if (node.text) return node.text;

    if (node.content && Array.isArray(node.content)) {
        return node.content
            .map(child => child.text || getNodeText(child))
            .join('');
    }

    return '';
}

export function serializeCommitMessage(doc: JSONContent): string {
    if (!doc || doc.type !== 'doc' || !doc.content) {
        return '';
    }

    let headerLine = '';
    let bodyText = '';
    const footerLines: string[] = [];

    for (const node of doc.content) {
        if (node.type === 'commitHeader') {
            const typeNode = node.content?.find(n => n.type === 'commitType');
            const scopeNode = node.content?.find(n => n.type === 'commitScope');
            const summaryNode = node.content?.find(n => n.type === 'commitSummary');

            const typeText = getNodeText(typeNode);
            const scopeText = getNodeText(scopeNode);
            const summaryText = getNodeText(summaryNode);

            headerLine = typeText;
            if (scopeText) {
                headerLine += `(${scopeText})`;
            }
            if (summaryText) {
                headerLine += `: ${summaryText}`;
            } else if (typeText) {
                headerLine += ': ';
            }
        } else if (node.type === 'commitBody') {
            if (node.content) {
                bodyText = node.content
                    .map(p => getNodeText(p))
                    .filter(text => text.length > 0)
                    .join('\n\n');
            }
        } else if (node.type === 'commitFooter') {
            const line = getNodeText(node);
            if (line) footerLines.push(line);
        }
    }

    const sections = [headerLine.trim()];
    if (bodyText) {
        sections.push(bodyText.trim());
    }
    if (footerLines.length > 0) {
        sections.push(footerLines.join('\n'));
    }

    return sections.join('\n\n').trim();
}

export function validateCommitMessage(doc: JSONContent): CommitValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!doc || doc.type !== 'doc' || !doc.content) {
        return { isValid: false, errors: ['Empty document'], warnings: [] };
    }

    const header = doc.content.find(n => n.type === 'commitHeader');
    if (!header) {
        errors.push('Missing commit header');
    } else {
        const typeNode = header.content?.find(n => n.type === 'commitType');
        const summaryNode = header.content?.find(n => n.type === 'commitSummary');

        const typeText = getNodeText(typeNode);
        const summaryText = getNodeText(summaryNode);

        if (!typeText) {
            errors.push('Commit type is required (e.g., feat, fix)');
        }
        if (!summaryText) {
            errors.push('Commit summary is required');
        } else {
            const fullHeader = serializeCommitMessage({ type: 'doc', content: [header] });
            if (fullHeader.length > 50) {
                warnings.push(`Header is ${fullHeader.length} chars (recommended: under 50)`);
            }

            if (summaryText.endsWith('.')) {
                warnings.push('Summary should not end with a period');
            }
            if (summaryText[0] && summaryText[0] === summaryText[0].toUpperCase()) {
                warnings.push('Summary should usually start with lowercase');
            }
        }
    }


    const body = doc.content.find(n => n.type === 'commitBody');
    if (body && body.content) {
        body.content.forEach((p, i) => {
            const text = getNodeText(p);
            if (text.length > 72) {
                warnings.push(`Body line ${i + 1} exceeds 72 characters`);
            }
        });
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
}

