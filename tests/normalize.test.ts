import { describe, it, expect } from 'vitest';
import { normalizeContent } from '../src/diff/normalize';

describe('normalizeContent', () => {
    it('should normalize CRLF to LF', () => {
        const input = 'line1\r\nline2\r\n';
        const expected = 'line1\nline2\n';
        expect(normalizeContent(input)).toBe(expected);
    });

    it('should trim trailing whitespace per line', () => {
        const input = 'line1   \nline2\t\n';
        const expected = 'line1\nline2\n';
        expect(normalizeContent(input)).toBe(expected);
    });

    it('should ensure exactly one newline at EOF', () => {
        const inputs = [
            'line1',
            'line1\n',
            'line1\n\n',
        ];
        const expected = 'line1\n';
        inputs.forEach(input => {
            expect(normalizeContent(input)).toBe(expected);
        });
    });

    it('should normalize empty content to single newline', () => {
        expect(normalizeContent('')).toBe('\n');
        expect(normalizeContent('   ')).toBe('\n');
    });

    it('should not change indentation', () => {
        const input = '  if (true) {\n    return;\n  }';
        const expected = '  if (true) {\n    return;\n  }\n';
        expect(normalizeContent(input)).toBe(expected);
    });
});
