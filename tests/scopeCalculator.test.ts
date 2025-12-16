
import { describe, it, expect } from 'vitest';
import { getDeepestSharedScope } from '../src/popup/utils/scopeCalculator';

describe('getDeepestSharedScope', () => {
    it('returns undefined for empty input', () => {
        expect(getDeepestSharedScope([])).toBeUndefined();
    });

    it('returns undefined for no common prefix', () => {
        expect(getDeepestSharedScope(['a/b', 'x/y'])).toBeUndefined();
    });

    it('returns the scope for a single file (last segment)', () => {
        // "src/components/Button.tsx" -> "Button.tsx" ? 
        // Based on logic it returns last segment.
        expect(getDeepestSharedScope(['src/components/Button'])).toBe('Button');
    });

    it('returns the shared folder when files are in same folder', () => {
        const files = [
            'src/components/Button.ts',
            'src/components/Header.ts'
        ];
        // Common: src/components
        // Scope: components
        expect(getDeepestSharedScope(files)).toBe('components');
    });

    it('returns the user example 1: scripts', () => {
        const files = [
            'stories/Sales_Story/scripts/global/ScriptObject_1/functions',
            'stories/Sales_Story/scripts/widgets/Page_1/onInitialize'
        ];
        // Common: stories/Sales_Story/scripts
        expect(getDeepestSharedScope(files)).toBe('scripts');
    });

    it('returns the user example 2: Page_1', () => {
        const files = [
            'stories/Sales_Story/scripts/widgets/Page_1/onInitialize',
            'stories/Sales_Story/scripts/widgets/Page_1/onActive'
        ];
        // Common: stories/Sales_Story/scripts/widgets/Page_1
        expect(getDeepestSharedScope(files)).toBe('Page_1');
    });

    it('handles nested paths where one is parent of another', () => {
        // Though unlikely in file selection unless selecting folder + file
        const files = [
            'a/b/c',
            'a/b/c/d'
        ];
        // Common: a/b/c
        expect(getDeepestSharedScope(files)).toBe('c');
    });
});
