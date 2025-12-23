import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    normalizePathSegment,
    parseGitHubScriptPath,
    patchStoryContentWithGitHubFile,
    removeContentFromStory,
    type PatchTarget
} from '../src/sac/revertPatch';

// Mock dependencies
vi.mock('../src/utils/errorHandler', () => ({
    devLog: vi.fn(),
    devError: vi.fn()
}));

describe('revertPatch', () => {
    // =========================================================================
    // normalizePathSegment tests
    // =========================================================================
    describe('normalizePathSegment', () => {
        it('should replace spaces with underscores', () => {
            expect(normalizePathSegment('My Button')).toBe('My_Button');
        });

        it('should replace slashes with underscores', () => {
            expect(normalizePathSegment('Path/To/Widget')).toBe('Path_To_Widget');
        });

        it('should collapse multiple spaces to single underscore', () => {
            expect(normalizePathSegment('My   Widget')).toBe('My_Widget');
        });

        it('should collapse multiple slashes to single underscore', () => {
            expect(normalizePathSegment('Path///Widget')).toBe('Path_Widget');
        });

        it('should handle mixed separators', () => {
            expect(normalizePathSegment('My / Widget Name')).toBe('My_Widget_Name');
        });

        it('should return empty string for empty input', () => {
            expect(normalizePathSegment('')).toBe('');
        });

        it('should not modify already normalized strings', () => {
            expect(normalizePathSegment('Button_1')).toBe('Button_1');
        });

        it('should handle leading and trailing spaces/slashes', () => {
            expect(normalizePathSegment(' Widget ')).toBe('_Widget_');
            expect(normalizePathSegment('/Widget/')).toBe('_Widget_');
        });
    });

    // =========================================================================
    // parseGitHubScriptPath tests
    // =========================================================================
    describe('parseGitHubScriptPath', () => {
        // Widget event paths
        it('should parse widget event path', () => {
            const result = parseGitHubScriptPath('stories/Sales_Story/scripts/widgets/Button_1/onClick.js');
            expect(result).toEqual({
                kind: 'widgetEvent',
                widgetFolder: 'Button_1',
                eventName: 'onClick'
            });
        });

        it('should parse widget event with complex names', () => {
            const result = parseGitHubScriptPath('stories/My_Story/scripts/widgets/Chart_Sales_2024/onSelect.js');
            expect(result).toEqual({
                kind: 'widgetEvent',
                widgetFolder: 'Chart_Sales_2024',
                eventName: 'onSelect'
            });
        });

        it('should parse widget event with underscores in event name', () => {
            const result = parseGitHubScriptPath('stories/Story/scripts/widgets/Widget_1/onResultSet.js');
            expect(result).toEqual({
                kind: 'widgetEvent',
                widgetFolder: 'Widget_1',
                eventName: 'onResultSet'
            });
        });

        // Global function paths
        it('should parse global function path', () => {
            const result = parseGitHubScriptPath('stories/Sales_Story/scripts/global/Utils/calculateTotal.js');
            expect(result).toEqual({
                kind: 'globalFunction',
                objectFolder: 'Utils',
                functionName: 'calculateTotal'
            });
        });

        it('should parse global function with complex object and function names', () => {
            const result = parseGitHubScriptPath('stories/Story/scripts/global/DataProcessing_Utils/transform_and_filter.js');
            expect(result).toEqual({
                kind: 'globalFunction',
                objectFolder: 'DataProcessing_Utils',
                functionName: 'transform_and_filter'
            });
        });

        // Global vars path
        it('should parse globalVars.js path', () => {
            const result = parseGitHubScriptPath('stories/Sales_Story/globalVars.js');
            expect(result).toEqual({ kind: 'globalVars' });
        });

        it('should parse globalVars.js with underscore in story name', () => {
            const result = parseGitHubScriptPath('stories/My_Sales_Dashboard/globalVars.js');
            expect(result).toEqual({ kind: 'globalVars' });
        });

        // Invalid paths - should return null
        it('should return null for README.md', () => {
            expect(parseGitHubScriptPath('stories/Sales_Story/README.md')).toBeNull();
        });

        it('should return null for non-js files in scripts folder', () => {
            expect(parseGitHubScriptPath('stories/Sales_Story/scripts/widgets/Button_1/onClick.ts')).toBeNull();
        });

        it('should return null for malformed paths', () => {
            expect(parseGitHubScriptPath('random/path/file.js')).toBeNull();
            expect(parseGitHubScriptPath('')).toBeNull();
            expect(parseGitHubScriptPath('stories/Story/scripts')).toBeNull();
        });

        it('should return null for paths with wrong depth (too shallow)', () => {
            // Too shallow - missing widget folder
            expect(parseGitHubScriptPath('stories/Story/scripts/widgets/onClick.js')).toBeNull();
        });

        it('should return null for paths with wrong depth (too deep)', () => {
            // Too deep - extra folder
            expect(parseGitHubScriptPath('stories/Story/scripts/widgets/Button/extra/onClick.js')).toBeNull();
        });

        it('should return null for unknown script categories', () => {
            expect(parseGitHubScriptPath('stories/Story/scripts/unknown/Widget/event.js')).toBeNull();
        });

        it('should return null for globalVars.js in wrong location', () => {
            // globalVars.js nested inside scripts folder should fail
            expect(parseGitHubScriptPath('stories/Story/scripts/globalVars.js')).toBeNull();
        });

        it('should return null for path missing scripts folder', () => {
            // Path that doesn't have scripts folder at correct position
            expect(parseGitHubScriptPath('stories/Story/widgets/Button_1/onClick.js')).toBeNull();
        });
    });

    // =========================================================================
    // patchStoryContentWithGitHubFile tests
    // =========================================================================
    describe('patchStoryContentWithGitHubFile', () => {
        // Helper to create mock SAC story content
        const createMockStoryContent = () => ({
            version: 1,
            entities: {
                'app-entity-1': {
                    app: {
                        names: {
                            'widget-instance-123': 'Button_1',
                            'widget-instance-456': 'Chart_1',
                            '[{"scriptObject":"so-guid-789"}]': 'Utils'
                        },
                        events: {
                            'widget-instance-123': {
                                onClick: 'console.log("old click");\n',
                                onHover: 'console.log("hover");\n'
                            }
                        }
                    },
                    scriptObjects: [
                        {
                            instanceId: '[{"scriptObject":"so-guid-789"}]',
                            payload: {
                                functionImplementations: {
                                    calculateTotal: 'return 0;\n',
                                    formatCurrency: 'return "$" + value;\n'
                                }
                            }
                        }
                    ]
                }
            }
        });

        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should patch widget event script', () => {
            const content = createMockStoryContent();
            const result = patchStoryContentWithGitHubFile({
                storyContent: content,
                githubPath: 'stories/Test/scripts/widgets/Button_1/onClick.js',
                githubFileText: 'console.log("new click from GitHub");'
            });

            expect(result.entities['app-entity-1'].app.events['widget-instance-123'].onClick)
                .toContain('new click from GitHub');
        });

        it('should patch global function', () => {
            const content = createMockStoryContent();
            const result = patchStoryContentWithGitHubFile({
                storyContent: content,
                githubPath: 'stories/Test/scripts/global/Utils/calculateTotal.js',
                githubFileText: 'return items.reduce((a, b) => a + b, 0);'
            });

            const scriptObj = result.entities['app-entity-1'].scriptObjects[0];
            expect(scriptObj.payload.functionImplementations.calculateTotal)
                .toContain('reduce');
        });

        it('should normalize content (trim whitespace, ensure newline)', () => {
            const content = createMockStoryContent();
            const result = patchStoryContentWithGitHubFile({
                storyContent: content,
                githubPath: 'stories/Test/scripts/widgets/Button_1/onClick.js',
                githubFileText: '  code with spaces  \r\n'
            });

            const patched = result.entities['app-entity-1'].app.events['widget-instance-123'].onClick;
            expect(patched).not.toMatch(/\r/); // No CRLF
            expect(patched.endsWith('\n')).toBe(true); // Ends with newline
        });

        it('should throw for unsupported file path', () => {
            const content = createMockStoryContent();
            expect(() => patchStoryContentWithGitHubFile({
                storyContent: content,
                githubPath: 'stories/Test/README.md',
                githubFileText: '# Readme'
            })).toThrow(/Unsupported file path/);
        });

        it('should throw for widget not found', () => {
            const content = createMockStoryContent();
            expect(() => patchStoryContentWithGitHubFile({
                storyContent: content,
                githubPath: 'stories/Test/scripts/widgets/NonExistent_Widget/onClick.js',
                githubFileText: 'code'
            })).toThrow(/No matching Widget found/);
        });

        it('should throw for ambiguous widget names', () => {
            const content = createMockStoryContent();
            // Add duplicate normalized name - use type assertion for dynamic key
            (content.entities['app-entity-1'].app.names as Record<string, string>)['widget-instance-999'] = 'Button_1';

            expect(() => patchStoryContentWithGitHubFile({
                storyContent: content,
                githubPath: 'stories/Test/scripts/widgets/Button_1/onClick.js',
                githubFileText: 'code'
            })).toThrow(/Ambiguous/);
        });

        it('should throw for missing Application entity', () => {
            const content = { version: 1, entities: {} };
            expect(() => patchStoryContentWithGitHubFile({
                storyContent: content,
                githubPath: 'stories/Test/scripts/widgets/Button_1/onClick.js',
                githubFileText: 'code'
            })).toThrow(/Could not find Application entity/);
        });

        it('should throw for globalVars (not yet supported)', () => {
            const content = createMockStoryContent();
            expect(() => patchStoryContentWithGitHubFile({
                storyContent: content,
                githubPath: 'stories/Test/globalVars.js',
                githubFileText: 'var x;'
            })).toThrow(/not supported yet/);
        });

        it('should patch in-place and return same reference', () => {
            const content = createMockStoryContent();
            const result = patchStoryContentWithGitHubFile({
                storyContent: content,
                githubPath: 'stories/Test/scripts/widgets/Button_1/onClick.js',
                githubFileText: 'new code'
            });

            expect(result).toBe(content); // Same object reference
        });

        it('should preserve other events on the same widget', () => {
            const content = createMockStoryContent();
            patchStoryContentWithGitHubFile({
                storyContent: content,
                githubPath: 'stories/Test/scripts/widgets/Button_1/onClick.js',
                githubFileText: 'new code'
            });

            // onHover should be preserved
            expect(content.entities['app-entity-1'].app.events['widget-instance-123'].onHover)
                .toBe('console.log("hover");\n');
        });

        it('should preserve other functions in the same script object', () => {
            const content = createMockStoryContent();
            patchStoryContentWithGitHubFile({
                storyContent: content,
                githubPath: 'stories/Test/scripts/global/Utils/calculateTotal.js',
                githubFileText: 'return 42;'
            });

            // formatCurrency should be preserved
            const scriptObj = content.entities['app-entity-1'].scriptObjects[0];
            expect(scriptObj.payload.functionImplementations.formatCurrency)
                .toBe('return "$" + value;\n');
        });

        it('should throw for script object not found', () => {
            const content = createMockStoryContent();
            expect(() => patchStoryContentWithGitHubFile({
                storyContent: content,
                githubPath: 'stories/Test/scripts/global/NonExistent/func.js',
                githubFileText: 'code'
            })).toThrow(/No matching Script Object found/);
        });

        it('should handle content with entities as array', () => {
            const content = {
                version: 1,
                entities: [
                    {
                        app: {
                            names: { 'widget-id': 'Button_1' },
                            events: { 'widget-id': { onClick: 'old\n' } }
                        }
                    }
                ]
            };

            const result = patchStoryContentWithGitHubFile({
                storyContent: content as any,
                githubPath: 'stories/Test/scripts/widgets/Button_1/onClick.js',
                githubFileText: 'new code'
            });

            expect(result.entities[0].app.events['widget-id'].onClick).toContain('new code');
        });

        it('should create events map for widget if events object exists but widget entry does not', () => {
            const content = {
                version: 1,
                entities: {
                    'app-entity': {
                        app: {
                            names: { 'widget-id': 'Button_1' },
                            events: {
                                // events map exists but no entry for this widget
                            }
                        }
                    }
                }
            };

            // The implementation should gracefully create the widget entry and event
            const result = patchStoryContentWithGitHubFile({
                storyContent: content as any,
                githubPath: 'stories/Test/scripts/widgets/Button_1/onClick.js',
                githubFileText: 'new code'
            });

            // Should create the widget events entry and add the event
            expect(result.entities['app-entity'].app.events['widget-id']).toBeDefined();
            expect(result.entities['app-entity'].app.events['widget-id'].onClick).toContain('new code');
        });
    });

    // =========================================================================
    // removeContentFromStory tests
    // =========================================================================
    describe('removeContentFromStory', () => {
        const createMockStoryContent = () => ({
            version: 1,
            entities: {
                'app-entity-1': {
                    app: {
                        names: {
                            'widget-instance-123': 'Button_1',
                            '[{"scriptObject":"so-guid-789"}]': 'Utils'
                        },
                        events: {
                            'widget-instance-123': {
                                onClick: 'console.log("click");\n',
                                onHover: 'console.log("hover");\n'
                            }
                        },
                        globalVars: {
                            'gv-1': { id: 'gv-1', name: 'count' }
                        }
                    },
                    scriptObjects: [
                        {
                            instanceId: '[{"scriptObject":"so-guid-789"}]',
                            payload: {
                                functionImplementations: {
                                    calculateTotal: 'return 0;\n',
                                    formatCurrency: 'return "$";\n'
                                }
                            }
                        }
                    ]
                }
            }
        });

        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should remove widget event', () => {
            const content = createMockStoryContent();
            const result = removeContentFromStory({
                storyContent: content as any,
                githubPath: 'stories/Test/scripts/widgets/Button_1/onClick.js'
            });

            expect(result.entities['app-entity-1'].app.events['widget-instance-123'].onClick).toBeUndefined();
            // Other events should remain
            expect(result.entities['app-entity-1'].app.events['widget-instance-123'].onHover).toBeDefined();
        });

        it('should clean up empty event objects', () => {
            const content = createMockStoryContent();
            // Remove all events except onClick from widget - use type assertion
            const widgetEvents = content.entities['app-entity-1'].app.events['widget-instance-123'] as Record<string, string | undefined>;
            delete widgetEvents.onHover;

            const result = removeContentFromStory({
                storyContent: content as any,
                githubPath: 'stories/Test/scripts/widgets/Button_1/onClick.js'
            });

            // The widget's entire events map should be removed since it's now empty
            expect(result.entities['app-entity-1'].app.events['widget-instance-123']).toBeUndefined();
        });

        it('should remove global function', () => {
            const content = createMockStoryContent();
            const result = removeContentFromStory({
                storyContent: content as any,
                githubPath: 'stories/Test/scripts/global/Utils/calculateTotal.js'
            });

            const scriptObj = result.entities['app-entity-1'].scriptObjects[0];
            expect(scriptObj.payload.functionImplementations.calculateTotal).toBeUndefined();
            // Other functions should remain
            expect(scriptObj.payload.functionImplementations.formatCurrency).toBeDefined();
        });

        it('should throw for unsupported path', () => {
            const content = createMockStoryContent();
            expect(() => removeContentFromStory({
                storyContent: content as any,
                githubPath: 'stories/Test/README.md'
            })).toThrow(/Unsupported file path/);
        });

        it('should throw for missing Application entity', () => {
            const content = { version: 1, entities: {} };
            expect(() => removeContentFromStory({
                storyContent: content,
                githubPath: 'stories/Test/scripts/widgets/Button_1/onClick.js'
            })).toThrow(/Could not find Application entity/);
        });

        it('should handle widget not found gracefully', () => {
            const content = createMockStoryContent();
            // Should throw because widget doesn't exist
            expect(() => removeContentFromStory({
                storyContent: content as any,
                githubPath: 'stories/Test/scripts/widgets/NonExistent/onClick.js'
            })).toThrow(/No matching Widget found/);
        });

        it('should handle script object not found gracefully', () => {
            const content = createMockStoryContent();
            // Should throw because script object doesn't exist
            expect(() => removeContentFromStory({
                storyContent: content as any,
                githubPath: 'stories/Test/scripts/global/NonExistent/func.js'
            })).toThrow(/No matching Script Object found/);
        });

        it('should clear global variables when globalVars.js path is provided', () => {
            const content = createMockStoryContent();
            const result = removeContentFromStory({
                storyContent: content as any,
                githubPath: 'stories/Test/globalVars.js'
            });

            expect(result.entities['app-entity-1'].app.globalVars).toEqual({});
        });

        it('should return same reference (in-place modification)', () => {
            const content = createMockStoryContent();
            const result = removeContentFromStory({
                storyContent: content as any,
                githubPath: 'stories/Test/scripts/widgets/Button_1/onClick.js'
            });

            expect(result).toBe(content);
        });

        it('should handle event that does not exist silently', () => {
            const content = createMockStoryContent();
            // Remove the onClick event first - use type assertion
            const widgetEvents = content.entities['app-entity-1'].app.events['widget-instance-123'] as Record<string, string | undefined>;
            delete widgetEvents.onClick;

            // Attempting to remove already-removed event should not throw
            const result = removeContentFromStory({
                storyContent: content as any,
                githubPath: 'stories/Test/scripts/widgets/Button_1/onClick.js'
            });

            // Should still have onHover
            expect(result.entities['app-entity-1'].app.events['widget-instance-123'].onHover).toBeDefined();
        });

        it('should handle function that does not exist silently', () => {
            const content = createMockStoryContent();
            // Remove the function first - use type assertion
            const funcImpls = content.entities['app-entity-1'].scriptObjects[0].payload.functionImplementations as Record<string, string | undefined>;
            delete funcImpls.calculateTotal;

            // Attempting to remove already-removed function should not throw
            const result = removeContentFromStory({
                storyContent: content as any,
                githubPath: 'stories/Test/scripts/global/Utils/calculateTotal.js'
            });

            // Should still have formatCurrency
            expect(result.entities['app-entity-1'].scriptObjects[0].payload.functionImplementations.formatCurrency).toBeDefined();
        });
    });
});
