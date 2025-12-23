export const FOOTER_TEMPLATES = [
    { label: 'Closes #', insertText: 'Closes #', description: 'Close issue' },
    { label: 'Refs #', insertText: 'Refs #', description: 'Reference issue' },
    { label: 'BREAKING CHANGE:', insertText: 'BREAKING CHANGE: ', description: 'Breaking change' },
    { label: 'Signed-off-by:', insertText: 'Signed-off-by: ', description: 'Sign-off' },
    { label: 'Co-authored-by:', insertText: 'Co-authored-by: ', description: 'Co-author' },
] as const;

export type FooterTemplate = typeof FOOTER_TEMPLATES[number];
