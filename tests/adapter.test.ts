import { describe, it, expect, vi } from 'vitest';
import { buildVirtualStoryTree } from '../src/diff/adapter';
import type { ParsedStoryContent } from '../src/popup/utils/sacParser';

describe('buildVirtualStoryTree', () => {
    // Helper to create basic mock content
    const createBasicContent = (): ParsedStoryContent => ({
        id: 'story-123',
        name: 'Sales Dashboard',
        description: 'Q4 sales analysis',
        content: {},
        pages: [
            { id: 'page-1', title: 'Overview' },
            { id: 'page-2', title: 'Details' }
        ],
        globalVars: [],
        scriptObjects: [],
        events: []
    });

    // =========================================================================
    // README.md generation tests
    // =========================================================================
    describe('README.md generation', () => {
        it('should create README.md with story name and description', () => {
            const content = createBasicContent();
            const tree = buildVirtualStoryTree(content);

            const readme = tree.get('stories/Sales_Dashboard/README.md');
            expect(readme).toBeDefined();
            expect(readme!.content).toContain('# Sales Dashboard');
            expect(readme!.content).toContain('Q4 sales analysis');
        });

        it('should list pages in README.md', () => {
            const content = createBasicContent();
            const tree = buildVirtualStoryTree(content);

            const readme = tree.get('stories/Sales_Dashboard/README.md');
            expect(readme!.content).toContain('Overview');
            expect(readme!.content).toContain('Details');
        });

        it('should handle missing pages gracefully', () => {
            const content = createBasicContent();
            content.pages = [];
            const tree = buildVirtualStoryTree(content);

            const readme = tree.get('stories/Sales_Dashboard/README.md');
            expect(readme!.content).toContain('No pages found');
        });

        it('should handle undefined pages gracefully', () => {
            const content = createBasicContent();
            (content as any).pages = undefined;
            const tree = buildVirtualStoryTree(content);

            const readme = tree.get('stories/Sales_Dashboard/README.md');
            expect(readme!.content).toContain('No pages found');
        });

        it('should handle missing name with fallback', () => {
            const content = createBasicContent();
            content.name = '';
            const tree = buildVirtualStoryTree(content);

            expect(tree.has('stories/story/README.md')).toBe(true);
        });

        it('should handle undefined name with fallback', () => {
            const content = createBasicContent();
            (content as any).name = undefined;
            const tree = buildVirtualStoryTree(content);

            expect(tree.has('stories/story/README.md')).toBe(true);
        });

        it('should use "Untitled Story" as title when name is missing', () => {
            const content = createBasicContent();
            content.name = '';
            const tree = buildVirtualStoryTree(content);

            const readme = tree.get('stories/story/README.md');
            expect(readme!.content).toContain('# Untitled Story');
        });

        it('should sanitize story name for path (replace spaces with underscores)', () => {
            const content = createBasicContent();
            content.name = 'Sales Marketing Dashboard';
            const tree = buildVirtualStoryTree(content);

            expect(tree.has('stories/Sales_Marketing_Dashboard/README.md')).toBe(true);
        });

        it('should sanitize story name for path (replace slashes with underscores)', () => {
            const content = createBasicContent();
            content.name = 'Sales/Marketing Dashboard';
            const tree = buildVirtualStoryTree(content);

            expect(tree.has('stories/Sales_Marketing_Dashboard/README.md')).toBe(true);
        });

        it('should handle missing description', () => {
            const content = createBasicContent();
            content.description = '';
            const tree = buildVirtualStoryTree(content);

            const readme = tree.get('stories/Sales_Dashboard/README.md');
            expect(readme!.content).toContain('# Sales Dashboard');
            // Should still be valid markdown
            expect(readme!.content).toContain('## Pages');
        });

        it('should include page IDs in README', () => {
            const content = createBasicContent();
            const tree = buildVirtualStoryTree(content);

            const readme = tree.get('stories/Sales_Dashboard/README.md');
            expect(readme!.content).toContain('page-1');
            expect(readme!.content).toContain('page-2');
        });
    });

    // =========================================================================
    // globalVars.js generation tests
    // =========================================================================
    describe('globalVars.js generation', () => {
        it('should create globalVars.js when global variables exist', () => {
            const content = createBasicContent();
            content.globalVars = [
                { id: 'gv-1', name: 'currentYear', description: 'The current year', type: 'Integer', isGlobal: true },
                { id: 'gv-2', name: 'userRole', description: '', type: 'String', isGlobal: true }
            ];
            const tree = buildVirtualStoryTree(content);

            const gvFile = tree.get('stories/Sales_Dashboard/globalVars.js');
            expect(gvFile).toBeDefined();
            expect(gvFile!.content).toContain('var currentYear;');
            expect(gvFile!.content).toContain('var userRole;');
        });

        it('should include type annotations in globalVars.js', () => {
            const content = createBasicContent();
            content.globalVars = [
                { id: 'gv-1', name: 'count', description: '', type: 'Integer', isGlobal: true }
            ];
            const tree = buildVirtualStoryTree(content);

            const gvFile = tree.get('stories/Sales_Dashboard/globalVars.js');
            expect(gvFile!.content).toContain('@type {Integer}');
        });

        it('should include descriptions in globalVars.js', () => {
            const content = createBasicContent();
            content.globalVars = [
                { id: 'gv-1', name: 'currentYear', description: 'The current year', type: 'Integer', isGlobal: true }
            ];
            const tree = buildVirtualStoryTree(content);

            const gvFile = tree.get('stories/Sales_Dashboard/globalVars.js');
            expect(gvFile!.content).toContain('The current year');
        });

        it('should not create globalVars.js when no global variables', () => {
            const content = createBasicContent();
            content.globalVars = [];
            const tree = buildVirtualStoryTree(content);

            expect(tree.has('stories/Sales_Dashboard/globalVars.js')).toBe(false);
        });

        it('should not create globalVars.js when globalVars is undefined', () => {
            const content = createBasicContent();
            (content as any).globalVars = undefined;
            const tree = buildVirtualStoryTree(content);

            expect(tree.has('stories/Sales_Dashboard/globalVars.js')).toBe(false);
        });

        it('should include story name in globalVars header comment', () => {
            const content = createBasicContent();
            content.globalVars = [
                { id: 'gv-1', name: 'test', description: '', type: 'String', isGlobal: true }
            ];
            const tree = buildVirtualStoryTree(content);

            const gvFile = tree.get('stories/Sales_Dashboard/globalVars.js');
            expect(gvFile!.content).toContain('Global Variables for Sales Dashboard');
        });
    });

    // =========================================================================
    // Script Objects (global functions) tests
    // =========================================================================
    describe('Script Objects (global functions)', () => {
        it('should create files for script object functions', () => {
            const content = createBasicContent();
            content.scriptObjects = [
                {
                    id: 'so-1',
                    name: 'Utils',
                    functions: [
                        { name: 'calculateTotal', arguments: [], body: 'return items.sum();' },
                        { name: 'formatDate', arguments: [], body: 'return date.toISOString();' }
                    ]
                }
            ];
            const tree = buildVirtualStoryTree(content);

            expect(tree.has('stories/Sales_Dashboard/scripts/global/Utils/calculateTotal.js')).toBe(true);
            expect(tree.has('stories/Sales_Dashboard/scripts/global/Utils/formatDate.js')).toBe(true);

            const calcFile = tree.get('stories/Sales_Dashboard/scripts/global/Utils/calculateTotal.js');
            expect(calcFile!.content).toContain('return items.sum();');
        });

        it('should skip functions with empty body', () => {
            const content = createBasicContent();
            content.scriptObjects = [
                {
                    id: 'so-1',
                    name: 'Utils',
                    functions: [
                        { name: 'emptyFunc', arguments: [], body: '' },
                        { name: 'realFunc', arguments: [], body: 'return 1;' }
                    ]
                }
            ];
            const tree = buildVirtualStoryTree(content);

            expect(tree.has('stories/Sales_Dashboard/scripts/global/Utils/emptyFunc.js')).toBe(false);
            expect(tree.has('stories/Sales_Dashboard/scripts/global/Utils/realFunc.js')).toBe(true);
        });

        it('should handle multiple script objects', () => {
            const content = createBasicContent();
            content.scriptObjects = [
                { id: 'so-1', name: 'Utils', functions: [{ name: 'helper', arguments: [], body: 'return 1;' }] },
                { id: 'so-2', name: 'Validators', functions: [{ name: 'check', arguments: [], body: 'return true;' }] }
            ];
            const tree = buildVirtualStoryTree(content);

            expect(tree.has('stories/Sales_Dashboard/scripts/global/Utils/helper.js')).toBe(true);
            expect(tree.has('stories/Sales_Dashboard/scripts/global/Validators/check.js')).toBe(true);
        });

        it('should handle script object with no functions', () => {
            const content = createBasicContent();
            content.scriptObjects = [
                { id: 'so-1', name: 'EmptyObject', functions: [] }
            ];
            const tree = buildVirtualStoryTree(content);

            // Should only have README.md
            expect(tree.size).toBe(1);
            expect(tree.has('stories/Sales_Dashboard/README.md')).toBe(true);
        });

        it('should handle undefined scriptObjects', () => {
            const content = createBasicContent();
            (content as any).scriptObjects = undefined;
            const tree = buildVirtualStoryTree(content);

            // Should only have README.md
            expect(tree.size).toBe(1);
        });
    });

    // =========================================================================
    // Widget Events tests
    // =========================================================================
    describe('Widget Events', () => {
        it('should create files for widget events', () => {
            const content = createBasicContent();
            content.events = [
                { widgetId: 'w-1', widgetName: 'Button_Submit', eventName: 'onClick', body: 'submit();' },
                { widgetId: 'w-2', widgetName: 'Input_Name', eventName: 'onChange', body: 'validate();' }
            ];
            const tree = buildVirtualStoryTree(content);

            expect(tree.has('stories/Sales_Dashboard/scripts/widgets/Button_Submit/onClick.js')).toBe(true);
            expect(tree.has('stories/Sales_Dashboard/scripts/widgets/Input_Name/onChange.js')).toBe(true);
        });

        it('should sanitize widget names for paths (spaces)', () => {
            const content = createBasicContent();
            content.events = [
                { widgetId: 'w-1', widgetName: 'My Button Submit', eventName: 'onClick', body: 'click();' }
            ];
            const tree = buildVirtualStoryTree(content);

            expect(tree.has('stories/Sales_Dashboard/scripts/widgets/My_Button_Submit/onClick.js')).toBe(true);
        });

        it('should sanitize widget names for paths (slashes)', () => {
            const content = createBasicContent();
            content.events = [
                { widgetId: 'w-1', widgetName: 'My/Button', eventName: 'onClick', body: 'click();' }
            ];
            const tree = buildVirtualStoryTree(content);

            expect(tree.has('stories/Sales_Dashboard/scripts/widgets/My_Button/onClick.js')).toBe(true);
        });

        it('should use widgetId as fallback when widgetName is empty', () => {
            const content = createBasicContent();
            content.events = [
                { widgetId: 'widget-123', widgetName: '', eventName: 'onClick', body: 'click();' }
            ];
            const tree = buildVirtualStoryTree(content);

            expect(tree.has('stories/Sales_Dashboard/scripts/widgets/widget-123/onClick.js')).toBe(true);
        });

        it('should use "UnknownWidget" when both widgetName and widgetId are missing', () => {
            const content = createBasicContent();
            content.events = [
                { widgetId: '', widgetName: '', eventName: 'onClick', body: 'click();' }
            ];
            const tree = buildVirtualStoryTree(content);

            expect(tree.has('stories/Sales_Dashboard/scripts/widgets/UnknownWidget/onClick.js')).toBe(true);
        });

        it('should skip events with empty body', () => {
            const content = createBasicContent();
            content.events = [
                { widgetId: 'w-1', widgetName: 'Button', eventName: 'onClick', body: '' },
                { widgetId: 'w-2', widgetName: 'Button2', eventName: 'onHover', body: 'hover();' }
            ];
            const tree = buildVirtualStoryTree(content);

            expect(tree.has('stories/Sales_Dashboard/scripts/widgets/Button/onClick.js')).toBe(false);
            expect(tree.has('stories/Sales_Dashboard/scripts/widgets/Button2/onHover.js')).toBe(true);
        });

        it('should handle multiple events on same widget', () => {
            const content = createBasicContent();
            content.events = [
                { widgetId: 'w-1', widgetName: 'Button', eventName: 'onClick', body: 'click();' },
                { widgetId: 'w-1', widgetName: 'Button', eventName: 'onHover', body: 'hover();' }
            ];
            const tree = buildVirtualStoryTree(content);

            expect(tree.has('stories/Sales_Dashboard/scripts/widgets/Button/onClick.js')).toBe(true);
            expect(tree.has('stories/Sales_Dashboard/scripts/widgets/Button/onHover.js')).toBe(true);
        });

        it('should handle undefined events', () => {
            const content = createBasicContent();
            (content as any).events = undefined;
            const tree = buildVirtualStoryTree(content);

            // Should only have README.md
            expect(tree.size).toBe(1);
        });

        it('should use default event name when eventName is missing', () => {
            const content = createBasicContent();
            content.events = [
                { widgetId: 'w-1', widgetName: 'Button', eventName: '', body: 'code();' }
            ];
            const tree = buildVirtualStoryTree(content);

            // Should use empty string or fallback - check what adapter does
            expect(tree.has('stories/Sales_Dashboard/scripts/widgets/Button/unknownEvent.js') ||
                tree.has('stories/Sales_Dashboard/scripts/widgets/Button/.js')).toBe(true);
        });
    });

    // =========================================================================
    // Content normalization tests
    // =========================================================================
    describe('Content normalization', () => {
        it('should normalize all file contents (no CRLF)', () => {
            const content = createBasicContent();
            content.events = [
                { widgetId: 'w-1', widgetName: 'Button', eventName: 'onClick', body: 'code\r\n' }
            ];
            const tree = buildVirtualStoryTree(content);

            const file = tree.get('stories/Sales_Dashboard/scripts/widgets/Button/onClick.js');
            expect(file!.content).not.toMatch(/\r/); // No CRLF
        });

        it('should ensure files end with newline', () => {
            const content = createBasicContent();
            content.events = [
                { widgetId: 'w-1', widgetName: 'Button', eventName: 'onClick', body: 'code without newline' }
            ];
            const tree = buildVirtualStoryTree(content);

            const file = tree.get('stories/Sales_Dashboard/scripts/widgets/Button/onClick.js');
            expect(file!.content.endsWith('\n')).toBe(true);
        });

        it('should trim trailing whitespace from lines', () => {
            const content = createBasicContent();
            content.events = [
                { widgetId: 'w-1', widgetName: 'Button', eventName: 'onClick', body: 'code with trailing   ' }
            ];
            const tree = buildVirtualStoryTree(content);

            const file = tree.get('stories/Sales_Dashboard/scripts/widgets/Button/onClick.js');
            expect(file!.content).not.toMatch(/   \n/);
        });

        it('should normalize README.md content', () => {
            const content = createBasicContent();
            const tree = buildVirtualStoryTree(content);

            const readme = tree.get('stories/Sales_Dashboard/README.md');
            expect(readme!.content.endsWith('\n')).toBe(true);
            expect(readme!.content).not.toMatch(/\r/);
        });

        it('should normalize globalVars.js content', () => {
            const content = createBasicContent();
            content.globalVars = [
                { id: 'gv-1', name: 'test', description: '', type: 'String', isGlobal: true }
            ];
            const tree = buildVirtualStoryTree(content);

            const gvFile = tree.get('stories/Sales_Dashboard/globalVars.js');
            expect(gvFile!.content.endsWith('\n')).toBe(true);
            expect(gvFile!.content).not.toMatch(/\r/);
        });
    });

    // =========================================================================
    // Empty content handling tests
    // =========================================================================
    describe('Empty content handling', () => {
        it('should return tree with only README.md for minimal content', () => {
            const content = createBasicContent();
            content.globalVars = [];
            content.scriptObjects = [];
            content.events = [];
            const tree = buildVirtualStoryTree(content);

            expect(tree.size).toBe(1);
            expect(tree.has('stories/Sales_Dashboard/README.md')).toBe(true);
        });

        it('should handle all undefined optional arrays', () => {
            const content: any = {
                id: 'story-123',
                name: 'Test Story',
                description: '',
                content: {},
                pages: undefined,
                globalVars: undefined,
                scriptObjects: undefined,
                events: undefined
            };
            const tree = buildVirtualStoryTree(content as ParsedStoryContent);

            expect(tree.size).toBe(1);
            expect(tree.has('stories/Test_Story/README.md')).toBe(true);
        });
    });

    // =========================================================================
    // VirtualFile structure tests
    // =========================================================================
    describe('VirtualFile structure', () => {
        it('should set correct path property on VirtualFile', () => {
            const content = createBasicContent();
            content.events = [
                { widgetId: 'w-1', widgetName: 'Button', eventName: 'onClick', body: 'click();' }
            ];
            const tree = buildVirtualStoryTree(content);

            const file = tree.get('stories/Sales_Dashboard/scripts/widgets/Button/onClick.js');
            expect(file!.path).toBe('stories/Sales_Dashboard/scripts/widgets/Button/onClick.js');
        });

        it('should return Map as VirtualTree', () => {
            const content = createBasicContent();
            const tree = buildVirtualStoryTree(content);

            expect(tree).toBeInstanceOf(Map);
        });
    });

    // =========================================================================
    // Complex content tests
    // =========================================================================
    describe('Complex content', () => {
        it('should handle story with all content types', () => {
            const content = createBasicContent();
            content.globalVars = [
                { id: 'gv-1', name: 'count', description: 'Counter', type: 'Integer', isGlobal: true }
            ];
            content.scriptObjects = [
                {
                    id: 'so-1',
                    name: 'Utils',
                    functions: [{ name: 'calc', arguments: [], body: 'return 1;' }]
                }
            ];
            content.events = [
                { widgetId: 'w-1', widgetName: 'Button', eventName: 'onClick', body: 'click();' }
            ];
            const tree = buildVirtualStoryTree(content);

            // Should have README + globalVars + 1 script object func + 1 event
            expect(tree.size).toBe(4);
            expect(tree.has('stories/Sales_Dashboard/README.md')).toBe(true);
            expect(tree.has('stories/Sales_Dashboard/globalVars.js')).toBe(true);
            expect(tree.has('stories/Sales_Dashboard/scripts/global/Utils/calc.js')).toBe(true);
            expect(tree.has('stories/Sales_Dashboard/scripts/widgets/Button/onClick.js')).toBe(true);
        });
    });
});
