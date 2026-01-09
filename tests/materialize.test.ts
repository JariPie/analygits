import { describe, it, expect } from 'vitest';
import { materializeSacScripts } from '../src/diff/materialize';

describe('materializeSacScripts', () => {
    it('should ignore null or invalid input', () => {
        expect(materializeSacScripts(null).size).toBe(0);
        expect(materializeSacScripts({}).size).toBe(0);
    });

    it('should materialize global scripts', () => {
        const input = {
            scriptObjects: [
                {
                    name: "Utils",
                    payload: {
                        functionImplementations: [
                            { name: "doStuff", body: "console.log('stuff');" }
                        ]
                    }
                }
            ]
        };

        const tree = materializeSacScripts(input);
        const path = "scripts/global/Utils/doStuff.js";

        expect(tree.has(path)).toBe(true);
        expect(tree.get(path)?.content).toBe("console.log('stuff');\n");
    });

    it('should materialize widget events (simple key)', () => {
        const input = {
            events: {
                "Button_1": {
                    "onClick": { body: "alert('clicked');" }
                }
            }
        };
        const tree = materializeSacScripts(input);
        const path = "scripts/widgets/Button_1/onClick.js";

        expect(tree.has(path)).toBe(true);
        expect(tree.get(path)?.content).toBe("alert('clicked');\n");
    });

    it('should materialize widget events (JSON key)', () => {
        const input = {
            events: {
                "{\"id\":\"Table_1\"}": {
                    "onSelect": { body: "console.log('selected');" }
                }
            }
        };
        const tree = materializeSacScripts(input);
        const path = "scripts/widgets/Table_1/onSelect.js";

        expect(tree.has(path)).toBe(true);
    });

    it('should normalize content in materialized scripts', () => {
        const input = {
            events: {
                "Button_1": {
                    "onClick": { body: "  code  " }
                }
            }
        };
        const tree = materializeSacScripts(input);
        // "  code  " -> "code\n"
        expect(tree.get("scripts/widgets/Button_1/onClick.js")?.content).toBe("  code\n");
    });

    it('should ignore empty scripts', () => {
        const input = {
            events: {
                "Button_1": {
                    "onClick": { body: "" }, // empty
                    "onHover": { body: "code" }
                }
            }
        };
        const tree = materializeSacScripts(input);
        expect(tree.size).toBe(1);
        expect(tree.has("scripts/widgets/Button_1/onHover.js")).toBe(true);
    });

    it('should sort output paths deterministically', () => {
        const input = {
            events: {
                "Z_Widget": { "onClick": { body: "a" } },
                "A_Widget": { "onClick": { body: "b" } }
            }
        };
        const tree = materializeSacScripts(input);
        const keys = Array.from(tree.keys());
        expect(keys).toEqual([
            "scripts/widgets/A_Widget/onClick.js",
            "scripts/widgets/Z_Widget/onClick.js"
        ]);
    });
});
