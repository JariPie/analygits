import { normalizeContent } from '../diff/normalize';

// Helper to normalize path segments (same as adapter.ts)
export function normalizePathSegment(str: string): string {
    return str.replace(/[\s\/]+/g, '_');
}

export type PatchKind = 'widgetEvent' | 'globalFunction' | 'globalVars';

export interface PatchTarget {
    kind: PatchKind;
    widgetFolder?: string;
    eventName?: string;
    objectFolder?: string;
    functionName?: string;
}

/**
 * Parses a GitHub file path to determine what it represents in the story.
 * Supports:
 * - stories/<Story>/scripts/widgets/<Widget>/<Event>.js
 * - stories/<Story>/scripts/global/<Object>/<Function>.js
 */
export function parseGitHubScriptPath(path: string): PatchTarget | null {
    const parts = path.split('/');
    // Expected structure:
    // stories / storyName / scripts / ...

    // If not under scripts, maybe globalVars?
    if (path.endsWith("globalVars.js")) {
        // Assuming stories/<Story>/globalVars.js
        // parts[0]=stories, parts[1]=Story, parts[2]=globalVars.js
        if (parts.length === 3) {
            return { kind: 'globalVars' };
        }
    }

    // Must be at least: stories, Story, scripts, category, ...
    if (parts.length < 5 || parts[2] !== 'scripts') return null;

    const category = parts[3]; // 'widgets' or 'global'

    if (category === 'widgets') {
        // widgets/<WidgetFolder>/<EventName>.js
        if (parts.length !== 6) return null;
        const widgetFolder = parts[4];
        const fileName = parts[5];
        if (!fileName.endsWith('.js')) return null;
        const eventName = fileName.replace('.js', '');
        return { kind: 'widgetEvent', widgetFolder, eventName };
    }

    if (category === 'global') {
        // global/<ObjectFolder>/<FunctionName>.js
        if (parts.length !== 6) return null;
        const objectFolder = parts[4];
        const fileName = parts[5];
        if (!fileName.endsWith('.js')) return null;
        const functionName = fileName.replace('.js', '');
        return { kind: 'globalFunction', objectFolder, functionName };
    }

    return null;
}

/**
 * Patches the story content object with the new script logic.
 * 
 * IMPORTANT: This function patches IN-PLACE and preserves all existing keys.
 * It does NOT prune empty arrays, empty strings, or any other fields.
 * Only the specific script text string is replaced.
 * 
 * Throws errors if ambiguity is found or target doesn't exist.
 */
export function patchStoryContentWithGitHubFile(params: {
    storyContent: any;
    githubPath: string;
    githubFileText: string;
}): any {
    const { storyContent, githubPath, githubFileText } = params;
    const target = parseGitHubScriptPath(githubPath);

    if (!target) {
        throw new Error("Unsupported file path for revert. Select a script file.");
    }

    // Use the content directly - do NOT deep clone with JSON.parse/JSON.stringify
    // as that may drop undefined values, change key ordering, or alter the structure.
    // We patch in-place and return the same object reference.
    const content = storyContent;

    // Find the application entity
    // storyContent.entities is a map or object. Key is usually "Application" or similar ID.
    // We look for the one containing `app` property.
    let appEntity: any = null;
    if (content.entities) {
        // Handle array or object map for entities
        const keys = Object.keys(content.entities);
        console.log(`[revertPatch] Searching for App Entity in ${keys.length} entities`);

        for (const key of keys) {
            const ent = content.entities[key];
            // Debug log for potential candidates
            if (ent && (ent.app || String(key).includes('application'))) {
                console.log(`[revertPatch] Checking entity ${key}:`, { id: ent.id, hasApp: !!ent.app, hasNames: !!(ent.app?.names) });
            }

            if (ent && ent.app && ent.app.names) {
                appEntity = ent;
                break;
            }
        }
    } else {
        console.error("[revertPatch] No entities collection found in content object:", content);
    }

    if (!appEntity) {
        throw new Error("Could not find Application entity in story content.");
    }

    // Build index: Normalized Name -> [Instance IDs]
    const nameIndex = new Map<string, string[]>();
    const namesMap = appEntity.app.names || {};

    for (const [id, humanName] of Object.entries(namesMap)) {
        if (typeof humanName === 'string') {
            const norm = normalizePathSegment(humanName);
            const list = nameIndex.get(norm) || [];
            list.push(id);
            nameIndex.set(norm, list);
        }
    }

    // Helpers
    const getSingleInstanceId = (folderName: string, typeLabel: string): string => {
        // folderName is already normalized because GitHub folders are normalized.
        // So we look it up directly in our normalized index.
        const matches = nameIndex.get(folderName);
        if (!matches || matches.length === 0) {
            throw new Error(`No matching ${typeLabel} found for "${folderName}" in SAC.`);
        }
        if (matches.length > 1) {
            throw new Error(`Ambiguous ${typeLabel} name "${folderName}" matches multiple IDs in SAC. Rename them in SAC to be unique.`);
        }
        return matches[0];
    };

    const newScriptContent = normalizeContent(githubFileText);

    if (target.kind === 'widgetEvent') {
        const instanceId = getSingleInstanceId(target.widgetFolder!, "Widget");

        // Ensure events map exists
        if (!appEntity.app.events) appEntity.app.events = {};
        if (!appEntity.app.events[instanceId]) appEntity.app.events[instanceId] = {};

        // Patch
        const oldLen = appEntity.app.events[instanceId][target.eventName!].length;
        appEntity.app.events[instanceId][target.eventName!] = newScriptContent;
        console.log(`[revertPatch] Patched ${target.eventName} on ${instanceId}. Size change: ${oldLen} -> ${newScriptContent.length}`);
        return content;
    }

    if (target.kind === 'globalFunction') {
        const instanceId = getSingleInstanceId(target.objectFolder!, "Script Object");

        // instanceId for script object is like: "Application...something...{\"scriptObject\":\"<uuid>\"}"
        // We need to parse out the UUID.
        let scriptObjectUuid: string | null = null;
        try {
            // It's often a composite ID string.
            // Check if it contains JSON.
            // But wait, user prompt says: "instanceId contains {\"scriptObject\":\"<uuid>\"}"
            // It might be part of the string.
            // E.g. "Start:{\"scriptObject\":\"12345\"}"
            const match = instanceId.match(/"scriptObject":"([^"]+)"/);
            if (match) {
                scriptObjectUuid = match[1];
            }
        } catch (e) {
            // ignore
        }

        if (!scriptObjectUuid) {
            // Fallback: maybe the instanceId IS the UUID? Or some other format?
            // If we can't extract it, we can't find the payload in scriptObjects[].
            throw new Error(`Could not extract Script Object UUID from instance ID: ${instanceId}`);
        }

        // Find the matching object in content.scriptObjects
        // content.scriptObjects is an array of objects.
        // Each has an `id` or `instanceId`? 
        // User prompt: "Identify the matching scriptObject in scriptObjects[] by scriptObject UUID inside instanceId"
        // And "entity.scriptObjects[].payload.functionImplementations[functionName]"

        if (!content.scriptObjects || !Array.isArray(content.scriptObjects)) {
            throw new Error("Story has no scriptObjects array.");
        }

        const scriptObj = content.scriptObjects.find((so: any) => so.id === scriptObjectUuid);
        if (!scriptObj) {
            throw new Error(`Script Object definition not found for UUID ${scriptObjectUuid}`);
        }

        if (!scriptObj.payload) scriptObj.payload = {};
        if (!scriptObj.payload.functionImplementations) scriptObj.payload.functionImplementations = {};

        // Patch
        const oldLen = scriptObj.payload.functionImplementations[target.functionName!].length;
        scriptObj.payload.functionImplementations[target.functionName!] = newScriptContent;
        console.log(`[revertPatch] Patched ${target.functionName} on ScriptObject. Size change: ${oldLen} -> ${newScriptContent.length}`);
        return content;
    }

    if (target.kind === 'globalVars') {
        // Not MVP required, but good to have prepared structure.
        // global variables are usually in content.globalVars (array)
        // Reverting globalVars.js is trickier because it's one file mapping to many variables.
        // We skip for now based on MVP scope.
        throw new Error("Reverting Global Variables is not supported yet.");
    }

    return content;
}
