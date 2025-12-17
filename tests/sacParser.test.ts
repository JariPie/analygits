import { describe, it, expect } from 'vitest';
import { parseSacStory } from '../src/popup/utils/sacParser';

describe('sacParser', () => {
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
