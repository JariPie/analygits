import { normalizeContent } from './normalize';
import type { VirtualTree } from './types';



export function materializeSacScripts(sacStoryJson: unknown): VirtualTree {
    const tree: VirtualTree = new Map();

    if (!sacStoryJson || typeof sacStoryJson !== 'object') {
        return tree;
    }



    const root = sacStoryJson as {
        scriptObjects?: unknown[];
        events?: Record<string, unknown>;
    };


    if (Array.isArray(root.scriptObjects)) {
        for (const obj of root.scriptObjects) {
            if (!isScriptObject(obj)) continue;



            const entityName = obj.name || 'Global';

            if (Array.isArray(obj.payload?.functionImplementations)) {
                for (const func of obj.payload.functionImplementations) {
                    if (!func.body) continue;

                    const eventName = func.name || 'unknown';
                    const path = `scripts/global/${entityName}/${eventName}.js`;
                    const content = normalizeContent(func.body);

                    tree.set(path, { path, content });
                }
            }
        }
    }


    if (root.events && typeof root.events === 'object') {
        for (const [key, value] of Object.entries(root.events)) {


            let entityName = key;


            try {
                const keyObj = JSON.parse(key);
                if (keyObj && typeof keyObj.id === 'string') {
                    entityName = keyObj.id;
                }
            } catch {
                // Use key as-is if not valid JSON
            }



            if (isEventMap(value)) {
                for (const [eventName, eventDef] of Object.entries(value)) {
                    let code = "";

                    if (typeof eventDef === 'string') {
                        code = eventDef;
                    } else if (isEventBody(eventDef)) {
                        code = eventDef.body;
                    }

                    if (!code) continue;

                    const path = `scripts/widgets/${entityName}/${eventName}.js`;
                    const content = normalizeContent(code);
                    tree.set(path, { path, content });
                }
            }
        }
    }

    // Sort by path for deterministic order
    const sortedEntries = Array.from(tree.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    return new Map(sortedEntries);
}


function isScriptObject(obj: unknown): obj is { name?: string; payload: { functionImplementations: { name?: string; body?: string }[] } } {
    if (!obj || typeof obj !== 'object') return false;
    const o = obj as any;
    return o.payload && Array.isArray(o.payload.functionImplementations);
}

function isEventMap(obj: unknown): obj is Record<string, string | { body: string }> {
    return !!obj && typeof obj === 'object';
}

function isEventBody(obj: unknown): obj is { body: string } {
    if (!obj || typeof obj !== 'object' || !('body' in obj)) return false;
    const candidate = obj as { body: unknown };
    return typeof candidate.body === 'string';
}
