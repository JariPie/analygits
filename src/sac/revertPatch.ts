import { normalizeContent } from '../diff/normalize';
import type { SacStoryContent } from '../types/sac';
import { devLog, devError } from '../utils/errorHandler';

// --- Types ---

export type PatchKind = 'widgetEvent' | 'globalFunction' | 'globalVars';

export interface PatchTarget {
    kind: PatchKind;
    widgetFolder?: string;
    eventName?: string;
    objectFolder?: string;
    functionName?: string;
}

interface AppEntityContext {
    appEntity: any;
    nameIndex: Map<string, string[]>;
}

// --- Path Utilities ---

/** Normalize path segments for consistent folder names */
export function normalizePathSegment(str: string): string {
    return str.replace(/[\s\/]+/g, '_');
}

/**
 * Parses a GitHub file path to determine what it represents in the story.
 * Supports:
 * - stories/<Story>/scripts/widgets/<Widget>/<Event>.js
 * - stories/<Story>/scripts/global/<Object>/<Function>.js
 * - stories/<Story>/globalVars.js
 */
export function parseGitHubScriptPath(path: string): PatchTarget | null {
    const parts = path.split('/');

    // Check for globalVars.js: stories/<Story>/globalVars.js
    if (path.endsWith('globalVars.js') && parts.length === 3) {
        return { kind: 'globalVars' };
    }

    // Must be at least: stories, Story, scripts, category, folder, file.js
    if (parts.length !== 6 || parts[2] !== 'scripts') {
        return null;
    }

    const category = parts[3];
    const folder = parts[4];
    const fileName = parts[5];

    if (!fileName.endsWith('.js')) {
        return null;
    }

    const name = fileName.replace('.js', '');

    if (category === 'widgets') {
        return { kind: 'widgetEvent', widgetFolder: folder, eventName: name };
    }

    if (category === 'global') {
        return { kind: 'globalFunction', objectFolder: folder, functionName: name };
    }

    return null;
}

// --- Internal Helpers ---

function findAppEntity(content: SacStoryContent): any {
    if (!content.entities) {
        devError('revertPatch', 'No entities collection found in content object');
        return null;
    }

    const entitiesMap = content.entities as Record<string, any>;
    for (const key of Object.keys(entitiesMap)) {
        const ent = entitiesMap[key];
        if (ent?.app?.names) {
            devLog('revertPatch', `Found App Entity: ${key}`);
            return ent;
        }
    }
    return null;
}

function buildNameIndex(appEntity: any): Map<string, string[]> {
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
    return nameIndex;
}

function getAppContext(content: SacStoryContent): AppEntityContext {
    const appEntity = findAppEntity(content);
    if (!appEntity) {
        throw new Error('Could not find Application entity in story content.');
    }
    return {
        appEntity,
        nameIndex: buildNameIndex(appEntity),
    };
}

function getSingleInstanceId(
    nameIndex: Map<string, string[]>,
    folderName: string,
    typeLabel: string
): string {
    const matches = nameIndex.get(folderName);
    if (!matches || matches.length === 0) {
        throw new Error(`No matching ${typeLabel} found for "${folderName}" in SAC.`);
    }
    if (matches.length > 1) {
        throw new Error(
            `Ambiguous ${typeLabel} name "${folderName}" matches multiple IDs in SAC. Rename them in SAC to be unique.`
        );
    }
    return matches[0];
}

function findScriptObject(appEntity: any, instanceId: string): any {
    if (!appEntity.scriptObjects || !Array.isArray(appEntity.scriptObjects)) {
        devError('revertPatch', 'appEntity has no scriptObjects array. Keys:', Object.keys(appEntity));
        throw new Error('Application entity has no scriptObjects array.');
    }

    devLog('revertPatch', `Searching ${appEntity.scriptObjects.length} scriptObjects for instanceId: ${instanceId}`);

    const scriptObj = appEntity.scriptObjects.find((so: any) => so.instanceId === instanceId);
    if (!scriptObj) {
        devError(
            'revertPatch',
            'Available scriptObject instanceIds:',
            appEntity.scriptObjects.map((so: any) => so.instanceId)
        );
        throw new Error(`Script Object not found for instanceId: ${instanceId}`);
    }
    return scriptObj;
}

// --- Public API ---

/**
 * Patches the story content object with the new script logic.
 *
 * IMPORTANT: This function patches IN-PLACE and preserves all existing keys.
 * It does NOT prune empty arrays, empty strings, or any other fields.
 * Only the specific script text string is replaced.
 *
 * @template T - The story content type, must extend SacStoryContent
 * @param params - Object containing storyContent, githubPath, and githubFileText
 * @returns The same story content object with the script patched in-place
 * @throws Error if ambiguity is found or target doesn't exist
 */
export function patchStoryContentWithGitHubFile<T extends SacStoryContent>(params: {
    storyContent: T;
    githubPath: string;
    githubFileText: string;
}): T {
    const { storyContent, githubPath, githubFileText } = params;
    const target = parseGitHubScriptPath(githubPath);

    if (!target) {
        throw new Error('Unsupported file path for revert. Select a script file.');
    }

    const { appEntity, nameIndex } = getAppContext(storyContent);
    const newScriptContent = normalizeContent(githubFileText);

    if (target.kind === 'widgetEvent') {
        const instanceId = getSingleInstanceId(nameIndex, target.widgetFolder!, 'Widget');

        // Ensure events map exists
        if (!appEntity.app.events) appEntity.app.events = {};
        if (!appEntity.app.events[instanceId]) appEntity.app.events[instanceId] = {};

        const oldLen = appEntity.app.events[instanceId][target.eventName!]?.length ?? 0;
        appEntity.app.events[instanceId][target.eventName!] = newScriptContent;
        devLog(
            'revertPatch',
            `Patched ${target.eventName} on ${instanceId}. Size: ${oldLen} -> ${newScriptContent.length}`
        );
        return storyContent;
    }

    if (target.kind === 'globalFunction') {
        const instanceId = getSingleInstanceId(nameIndex, target.objectFolder!, 'Script Object');
        const scriptObj = findScriptObject(appEntity, instanceId);

        if (!scriptObj.payload) scriptObj.payload = {};
        if (!scriptObj.payload.functionImplementations) scriptObj.payload.functionImplementations = {};

        const oldLen = scriptObj.payload.functionImplementations[target.functionName!]?.length ?? 0;
        scriptObj.payload.functionImplementations[target.functionName!] = newScriptContent;
        devLog(
            'revertPatch',
            `Patched ${target.functionName} on ScriptObject. Size: ${oldLen} -> ${newScriptContent.length}`
        );
        return storyContent;
    }

    if (target.kind === 'globalVars') {
        throw new Error('Reverting Global Variables is not supported yet.');
    }

    return storyContent;
}

/**
 * Removes/clears content from the story based on the target type.
 * Used when reverting "added" files (files that exist in SAC but not in GitHub).
 *
 * @template T - The story content type, must extend SacStoryContent
 * @param params - Object containing storyContent and githubPath
 * @returns The same story content object with the content removed in-place
 */
export function removeContentFromStory<T extends SacStoryContent>(params: {
    storyContent: T;
    githubPath: string;
}): T {
    const { storyContent, githubPath } = params;
    const target = parseGitHubScriptPath(githubPath);

    if (!target) {
        throw new Error('Unsupported file path for removal.');
    }

    const { appEntity, nameIndex } = getAppContext(storyContent);

    if (target.kind === 'widgetEvent') {
        const instanceId = getSingleInstanceId(nameIndex, target.widgetFolder!, 'Widget');

        if (appEntity.app.events?.[instanceId]?.[target.eventName!]) {
            devLog('revertPatch', `Removing event ${target.eventName} from ${instanceId}`);
            delete appEntity.app.events[instanceId][target.eventName!];

            // Clean up empty event objects
            if (Object.keys(appEntity.app.events[instanceId]).length === 0) {
                delete appEntity.app.events[instanceId];
            }
        }
        return storyContent;
    }

    if (target.kind === 'globalFunction') {
        const instanceId = getSingleInstanceId(nameIndex, target.objectFolder!, 'Script Object');

        if (appEntity.scriptObjects && Array.isArray(appEntity.scriptObjects)) {
            const scriptObj = appEntity.scriptObjects.find((so: any) => so.instanceId === instanceId);
            if (scriptObj?.payload?.functionImplementations?.[target.functionName!]) {
                devLog('revertPatch', `Removing function ${target.functionName} from ScriptObject`);
                delete scriptObj.payload.functionImplementations[target.functionName!];
            }
        }
        return storyContent;
    }

    if (target.kind === 'globalVars') {
        if (appEntity.app.globalVars) {
            devLog('revertPatch', 'Clearing all global variables');
            appEntity.app.globalVars = {};
        }
        return storyContent;
    }

    return storyContent;
}