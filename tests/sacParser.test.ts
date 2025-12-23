import { describe, it, expect, vi } from 'vitest';
import { parseSacStory, extractStoryDetails } from '../src/popup/utils/sacParser';

// Mock dependencies
vi.mock('../src/utils/errorHandler', () => ({
    devLog: vi.fn(),
    devError: vi.fn(),
    devWarn: vi.fn()
}));

describe('sacParser', () => {
    // =========================================================================
    // Basic structure validation tests
    // =========================================================================
    describe('basic structure validation', () => {
        it('should throw "Invalid SAC Story structure" when cdata is missing', () => {
            const input = {
                resource: {
                    resourceId: '123'
                    // missing cdata
                }
            };
            expect(() => parseSacStory(JSON.stringify(input))).toThrow(/Invalid SAC Story structure/);
        });

        it('should fail if resource is missing entirely', () => {
            const input = {}; // Empty object
            expect(() => parseSacStory(JSON.stringify(input))).toThrow(/Invalid SAC Story structure/);
        });

        it('should gracefully handle unexpected missing resource property', () => {
            // This tests the "missing 'resource' property" scenario the user might be referring to
            const input = { NOT_RESOURCE: 1 };
            expect(() => parseSacStory(JSON.stringify(input))).toThrow(/Invalid SAC Story structure: 'cdata' property is missing/);
        });

        it('should handle missing id safely by assigning a default', () => {
            const input = {
                resource: {
                    name: "Test",
                    cdata: { content: "{}" }
                }
            };
            const result = parseSacStory(JSON.stringify(input));
            expect(result.id).toBe("empty-story");
        });
    });

    // =========================================================================
    // Edge cases for parseSacStory
    // =========================================================================
    describe('parseSacStory - edge cases', () => {
        it('should handle story with empty entities array', () => {
            const input = {
                resource: {
                    resourceId: 'story-123',
                    name: 'Empty Story',
                    description: 'No content',
                    cdata: {
                        content: JSON.stringify({
                            version: '1.0',
                            entities: []
                        })
                    }
                }
            };
            const result = parseSacStory(JSON.stringify(input));
            expect(result.id).toBe('story-123');
            expect(result.pages).toEqual([]);
            expect(result.events).toEqual([]);
        });

        it('should handle entities as object map instead of array', () => {
            const input = {
                resource: {
                    resourceId: 'story-456',
                    name: 'Object Map Story',
                    description: '',
                    cdata: {
                        content: JSON.stringify({
                            version: '1.0',
                            entities: {
                                'entity-1': { type: 'application', app: { names: {} } },
                                'entity-2': { type: 'story', data: { pages: [] } }
                            }
                        })
                    }
                }
            };
            const result = parseSacStory(JSON.stringify(input));
            expect(result).toBeDefined();
            expect(result.id).toBe('story-456');
        });

        it('should extract script objects with modern instanceId format', () => {
            const input = {
                resource: {
                    resourceId: 'story-789',
                    name: 'Modern Story',
                    description: '',
                    cdata: {
                        content: JSON.stringify({
                            version: '1.0',
                            entities: {
                                'app-1': {
                                    app: {
                                        names: {
                                            '[{"scriptObject":"guid-123"}]': 'UtilityFunctions'
                                        }
                                    },
                                    scriptObjects: [{
                                        instanceId: '[{"scriptObject":"guid-123"}]',
                                        payload: {
                                            functionImplementations: {
                                                calculate: 'return 42;'
                                            }
                                        }
                                    }]
                                }
                            }
                        })
                    }
                }
            };
            const result = parseSacStory(JSON.stringify(input));
            expect(result.scriptObjects.length).toBeGreaterThan(0);
            expect(result.scriptObjects[0].name).toBe('UtilityFunctions');
        });

        it('should handle deeply nested content JSON', () => {
            const input = {
                resource: {
                    resourceId: 'story-nested',
                    name: 'Nested',
                    description: '',
                    cdata: {
                        content: JSON.stringify({
                            version: '1.0',
                            entities: [{
                                // Need names at root level to be identified as appEntity
                                names: { 'w-1': 'Button_1' },
                                app: {
                                    names: { 'w-1': 'Button_1' },
                                    events: {
                                        'w-1': {
                                            onClick: 'nested();'
                                        }
                                    }
                                }
                            }]
                        })
                    }
                }
            };
            const result = parseSacStory(JSON.stringify(input));
            expect(result.events.length).toBe(1);
            expect(result.events[0].body).toBe('nested();');
        });

        it('should handle malformed JSON in cdata.content gracefully', () => {
            const input = {
                resource: {
                    resourceId: 'story-bad',
                    name: 'Bad JSON',
                    description: '',
                    cdata: {
                        content: 'not valid json {'
                    }
                }
            };
            // Should not throw, should return raw string as content
            const result = parseSacStory(JSON.stringify(input));
            expect(result.content).toBe('not valid json {');
        });

        it('should handle null name and description gracefully', () => {
            const input = {
                resource: {
                    resourceId: 'story-null',
                    name: null,
                    description: null,
                    cdata: {
                        content: JSON.stringify({
                            version: '1.0',
                            entities: {}
                        })
                    }
                }
            };
            // Should not throw, should handle gracefully
            const result = parseSacStory(JSON.stringify(input));
            expect(result.name).toBe('Untitled Story');
            expect(result.description).toBe('');
        });

        it('should extract events with human-readable widget names from names map', () => {
            const input = {
                resource: {
                    resourceId: 'story-names',
                    name: 'Names Test',
                    description: '',
                    cdata: {
                        content: JSON.stringify({
                            version: '1.0',
                            entities: [{
                                // Need names at root level to be identified as appEntity
                                names: { 'instance-abc': 'SubmitButton' },
                                app: {
                                    names: {
                                        'instance-abc': 'SubmitButton'
                                    },
                                    events: {
                                        'instance-abc': {
                                            onClick: 'submit();'
                                        }
                                    }
                                }
                            }]
                        })
                    }
                }
            };
            const result = parseSacStory(JSON.stringify(input));
            expect(result.events.length).toBe(1);
            expect(result.events[0].widgetName).toBe('SubmitButton');
        });

        it('should use resourceId when available', () => {
            const input = {
                resource: {
                    resourceId: 'res-12345',
                    name: 'Test',
                    cdata: {
                        content: JSON.stringify({ version: '1.0', entities: {} })
                    }
                }
            };
            const result = parseSacStory(JSON.stringify(input));
            expect(result.id).toBe('res-12345');
        });

        it('should use fallback id when resourceId is missing', () => {
            const input = {
                resource: {
                    id: 'alt-id-123',
                    name: 'Test',
                    cdata: {
                        content: JSON.stringify({ version: '1.0', entities: {} })
                    }
                }
            };
            const result = parseSacStory(JSON.stringify(input));
            expect(result.id).toBe('alt-id-123');
        });

        it('should handle empty content string', () => {
            const input = {
                resource: {
                    resourceId: 'story-empty',
                    name: 'Empty',
                    cdata: {
                        content: ''
                    }
                }
            };
            const result = parseSacStory(JSON.stringify(input));
            expect(result.content).toEqual({ message: 'Content is empty in the response.' });
        });

        it('should throw SAC_SESSION_TIMEOUT for HTML login response', () => {
            expect(() => parseSacStory('<html><body>Login</body></html>')).toThrow('SAC_SESSION_TIMEOUT');
        });

        it('should throw SAC_SESSION_TIMEOUT for session terminated message', () => {
            expect(() => parseSacStory('Session terminated due to inactivity')).toThrow('SAC_SESSION_TIMEOUT');
        });

        it('should throw SAC_SESSION_TIMEOUT for German session timeout message', () => {
            expect(() => parseSacStory('Sitzung beendet')).toThrow('SAC_SESSION_TIMEOUT');
        });

        it('should throw SAC_PARSE_FAILED for invalid non-HTML JSON', () => {
            expect(() => parseSacStory('random invalid data')).toThrow('SAC_PARSE_FAILED');
        });

        it('should throw for missing cdata.content', () => {
            const input = {
                resource: {
                    resourceId: 'story-123',
                    name: 'Test',
                    cdata: {}
                }
            };
            expect(() => parseSacStory(JSON.stringify(input))).toThrow(/cdata.content/);
        });
    });

    // =========================================================================
    // extractStoryDetails tests
    // =========================================================================
    describe('extractStoryDetails', () => {
        it('should return empty arrays for null input', () => {
            const result = extractStoryDetails(null);
            expect(result.pages).toEqual([]);
            expect(result.globalVars).toEqual([]);
            expect(result.scriptObjects).toEqual([]);
            expect(result.events).toEqual([]);
        });

        it('should return empty arrays for undefined input', () => {
            const result = extractStoryDetails(undefined);
            expect(result.pages).toEqual([]);
            expect(result.globalVars).toEqual([]);
            expect(result.scriptObjects).toEqual([]);
            expect(result.events).toEqual([]);
        });

        it('should return empty arrays for empty object input', () => {
            const result = extractStoryDetails({});
            expect(result.pages).toEqual([]);
            expect(result.globalVars).toEqual([]);
            expect(result.scriptObjects).toEqual([]);
            expect(result.events).toEqual([]);
        });

        it('should extract pages from story entity in array', () => {
            const content = {
                entities: [
                    {
                        type: 'story',
                        data: {
                            pages: [
                                { id: 'page-1', title: 'Page One' },
                                { id: 'page-2', title: 'Page Two' }
                            ]
                        }
                    }
                ]
            };
            const result = extractStoryDetails(content);
            expect(result.pages.length).toBe(2);
            expect(result.pages[0].title).toBe('Page One');
        });

        it('should extract pages from story entity in object map', () => {
            const content = {
                entities: {
                    'story-entity': {
                        type: 'story',
                        data: {
                            pages: [
                                { id: 'page-1', title: 'Overview' }
                            ]
                        }
                    }
                }
            };
            const result = extractStoryDetails(content);
            expect(result.pages.length).toBe(1);
            expect(result.pages[0].title).toBe('Overview');
        });

        it('should extract global variables from app entity', () => {
            const content = {
                entities: [{
                    // Need globalVars at root level to be found as appEntity
                    globalVars: [
                        { id: 'gv-1', name: 'count', type: 'Integer', description: 'Counter' }
                    ],
                    app: {
                        names: {},
                        globalVars: [
                            { id: 'gv-1', name: 'count', type: 'Integer', description: 'Counter' }
                        ]
                    }
                }]
            };
            const result = extractStoryDetails(content);
            expect(result.globalVars.length).toBe(1);
            expect(result.globalVars[0].name).toBe('count');
            expect(result.globalVars[0].type).toBe('Integer');
        });

        it('should handle global variables as object map', () => {
            const content = {
                entities: [{
                    // Need globalVars at root or names to be found as appEntity
                    names: {},
                    globalVars: {
                        'var1': { id: 'gv-1', name: 'count', type: 'Integer' }
                    }
                }]
            };
            const result = extractStoryDetails(content);
            expect(result.globalVars.length).toBe(1);
        });

        it('should resolve global variable names from names map', () => {
            const content = {
                entities: [{
                    // Need names at root level to be found as appEntity
                    names: {
                        '[{"scriptVariable":"gv-guid"}]': 'UserRole'
                    },
                    app: {
                        names: {
                            '[{"scriptVariable":"gv-guid"}]': 'UserRole'
                        },
                        globalVars: [
                            { id: 'gv-guid' }
                        ]
                    }
                }]
            };
            const result = extractStoryDetails(content);
            expect(result.globalVars.length).toBe(1);
            expect(result.globalVars[0].name).toBe('UserRole');
        });

        it('should extract script objects with function implementations', () => {
            const content = {
                entities: [{
                    app: {
                        names: {
                            '[{"scriptObject":"so-guid"}]': 'HelperFunctions'
                        }
                    },
                    scriptObjects: [{
                        instanceId: '[{"scriptObject":"so-guid"}]',
                        payload: {
                            functionImplementations: {
                                doSomething: 'return true;',
                                calculate: 'return 42;'
                            }
                        }
                    }]
                }]
            };
            const result = extractStoryDetails(content);
            expect(result.scriptObjects.length).toBe(1);
            expect(result.scriptObjects[0].name).toBe('HelperFunctions');
            expect(result.scriptObjects[0].functions.length).toBe(2);
        });

        it('should extract events from centralized events map', () => {
            const content = {
                entities: [{
                    // Need names at root level to be found as appEntity
                    names: {
                        'widget-123': 'SubmitButton'
                    },
                    app: {
                        names: {
                            'widget-123': 'SubmitButton'
                        },
                        events: {
                            'widget-123': {
                                onClick: 'submit();',
                                onHover: 'highlight();'
                            }
                        }
                    }
                }]
            };
            const result = extractStoryDetails(content);
            expect(result.events.length).toBe(2);
            expect(result.events.find(e => e.eventName === 'onClick')?.widgetName).toBe('SubmitButton');
        });

        it('should parse complex JSON widget keys for events', () => {
            const content = {
                entities: [{
                    // Need names at root level to be found as appEntity
                    names: {},
                    app: {
                        names: {},
                        events: {
                            '[{"appPage":"page-guid"},{"widget":"widget-guid"}]': {
                                onClick: 'click();'
                            }
                        }
                    }
                }]
            };
            const result = extractStoryDetails(content);
            expect(result.events.length).toBe(1);
            // Should extract widget-guid from the complex key
            expect(result.events[0].widgetId).toBe('widget-guid');
        });

        it('should find app entity by ID suffix :application', () => {
            const content = {
                entities: [{
                    id: 'some-guid:application',
                    app: {
                        names: { 'w-1': 'Button' },
                        events: { 'w-1': { onClick: 'click();' } }
                    }
                }]
            };
            const result = extractStoryDetails(content);
            expect(result.events.length).toBe(1);
        });

        it('should find app entity by scriptObjects property', () => {
            const content = {
                entities: [{
                    scriptObjects: [{
                        instanceId: 'so-1',
                        payload: {
                            functionImplementations: { fn: 'return 1;' }
                        }
                    }],
                    app: {
                        names: { 'so-1': 'Utils' }
                    }
                }]
            };
            const result = extractStoryDetails(content);
            expect(result.scriptObjects.length).toBe(1);
        });

        it('should handle legacy script object format with functions array', () => {
            const content = {
                entities: [{
                    app: { names: { 'so-1': 'LegacyUtils' } },
                    scriptObjects: [{
                        id: 'so-1',
                        functions: [
                            { name: 'helper', body: 'return true;', arguments: [] }
                        ]
                    }]
                }]
            };
            const result = extractStoryDetails(content);
            expect(result.scriptObjects.length).toBe(1);
            expect(result.scriptObjects[0].functions.length).toBe(1);
            expect(result.scriptObjects[0].functions[0].name).toBe('helper');
        });

        it('should extract GUID from modern instanceId format', () => {
            const content = {
                entities: [{
                    app: { names: {} },
                    scriptObjects: [{
                        instanceId: '[{"scriptObject":"1234-5678-abcd"}]',
                        payload: {
                            functionImplementations: { test: 'return;' }
                        }
                    }]
                }]
            };
            const result = extractStoryDetails(content);
            expect(result.scriptObjects.length).toBe(1);
            // ID should be extracted GUID
            expect(result.scriptObjects[0].id).toBe('1234-5678-abcd');
        });

        it('should handle entities.app shortcut for object map', () => {
            const content = {
                entities: {
                    app: {
                        names: { 'w-1': 'Widget' },
                        events: { 'w-1': { onClick: 'click();' } }
                    }
                }
            };
            const result = extractStoryDetails(content);
            expect(result.events.length).toBe(1);
        });

        it('should scan for events in legacy entity structure', () => {
            const content = {
                entities: [{
                    id: 'widget-1',
                    events: [
                        { name: 'onClick', body: 'click();' }
                    ]
                }]
            };
            const result = extractStoryDetails(content);
            // Legacy fallback should pick up events
            expect(result.events.length).toBe(1);
            expect(result.events[0].eventName).toBe('onClick');
        });

        it('should skip pages without id or title', () => {
            const content = {
                entities: [{
                    type: 'story',
                    data: {
                        pages: [
                            { id: 'page-1', title: 'Valid' },
                            { id: 'page-2' }, // missing title
                            { title: 'No ID' } // missing id
                        ]
                    }
                }]
            };
            const result = extractStoryDetails(content);
            expect(result.pages.length).toBe(1);
            expect(result.pages[0].title).toBe('Valid');
        });
    });
});
