/**
 * SAC (SAP Analytics Cloud) API Type Definitions
 * 
 * These types model the structures returned by the SAC REST API.
 * SAC content is deeply nested with multiple possible structures
 * depending on story version and optimization level.
 */

/**
 * Raw API response wrapper from SAC contentlib endpoint.
 * The actual content is nested several layers deep.
 */
export interface SacApiResponse {
    resource: SacResource;
}


export interface SacResource {
    resourceId: string;
    resourceType: string;
    name: string;
    description: string;
    /** Contains the actual story content - may be stringified JSON */
    cdata: SacCdata;
    /** Version counter for optimistic locking */
    updateCounter?: number;
    [key: string]: unknown;
}

/**
 * The cdata wrapper that contains story content.
 * Content may be in `content` or `contentOptimized` depending on story type.
 */
export interface SacCdata {
    /** Stringified JSON or parsed object containing story content */
    content?: string | SacStoryContent;
    /** Alternative location for unified stories */
    contentOptimized?: string | SacStoryContent;
    /** Version counter (sometimes here instead of resource level) */
    updateCounter?: number;
    [key: string]: unknown;
}

/**
 * The parsed inner content of a SAC story.
 * This is what you get after parsing cdata.content or cdata.contentOptimized.
 */
export interface SacStoryContent {
    /** Content version number for optimistic locking */
    version: number;
    /** 
     * Entities can be an array OR object map depending on story structure.
     * When array: entities are indexed by position
     * When object: entities are keyed by ID (often GUID or type prefix)
     */
    entities: SacEntity[] | Record<string, SacEntity>;
    /** Script objects at content root (legacy location) */
    scriptObjects?: SacScriptObject[];
    /** Global variables at content root (legacy location) */
    globalVars?: SacGlobalVar[];
    [key: string]: unknown;
}


export type SacEntity = SacAppEntity | SacStoryEntity | SacGenericEntity;


export interface SacGenericEntity {
    id?: string;
    type?: string;
    data?: unknown;
    [key: string]: unknown;
}

/**
 * The Application entity containing app-level configuration.
 * Contains the names map, events, global variables, and script objects.
 */
export interface SacAppEntity extends SacGenericEntity {
    /** Nested app configuration object */
    app?: SacAppConfig;
    /** Script objects array (newer structure) */
    scriptObjects?: SacScriptObject[];
    /** Global variables (alternative location) */
    globalVars?: SacGlobalVar[];
    /** Names map for resolving IDs to human-readable names */
    names?: Record<string, string>;
}


export interface SacAppConfig {
    /** Maps instance IDs to human-readable names */
    names?: Record<string, string>;
    /** Events map: widget instance ID -> event name -> script body */
    events?: Record<string, Record<string, string>>;
    /** Global variables */
    globalVars?: SacGlobalVar[] | Record<string, SacGlobalVar>;
    [key: string]: unknown;
}


export interface SacStoryEntity extends SacGenericEntity {
    type: 'story';
    data?: {
        pages?: SacPage[];
        [key: string]: unknown;
    };
}


export interface SacPage {
    id: string;
    title: string;
    [key: string]: unknown;
}

// ============================================================================
// SCRIPT OBJECT TYPES
// ============================================================================

/**
 * Script Object - reusable code container.
 * 
 * Structure varies between legacy and modern stories:
 * - Modern: instanceId is JSON string like `[{"scriptObject":"GUID"}]`
 * - Legacy: Simple id/name with functions array
 */
export interface SacScriptObject {
    /** Simple ID (legacy) or GUID */
    id?: string;
    /** JSON-encoded instance ID (modern) - e.g., `[{"scriptObject":"GUID"}]` */
    instanceId?: string;
    /** Human-readable name (legacy structure) */
    name?: string;
    /** Script payload containing function implementations */
    payload?: SacScriptPayload;
    /** Legacy: array of function definitions */
    functions?: SacScriptFunction[];
    [key: string]: unknown;
}


export interface SacScriptPayload {
    /** Map of function names to their implementation code */
    functionImplementations?: Record<string, string>;
    /** Map of function names to their signatures */
    functionSignatures?: Record<string, SacFunctionSignature>;
    [key: string]: unknown;
}


export interface SacFunctionSignature {
    arguments?: SacFunctionArgument[];
    returnType?: string;
    [key: string]: unknown;
}


export interface SacFunctionArgument {
    name: string;
    type: string;
    [key: string]: unknown;
}


export interface SacScriptFunction {
    name: string;
    arguments?: SacFunctionArgument[];
    body: string;
    [key: string]: unknown;
}


export interface SacGlobalVar {
    id: string;
    name?: string;
    description?: string;
    type?: string;
    defaultValue?: unknown;
    [key: string]: unknown;
}


export interface SacWidgetEvent {
    /** Widget instance ID (may be JSON key or GUID) */
    widgetId: string;
    /** Event name (e.g., "onClick", "onInit") */
    eventName: string;
    /** Script body */
    body: string;
}

/**
 * Events map structure as stored in SAC.
 * Keys are JSON strings like `[{"appPage":"GUID"},{"widget":"Button_1"}]`
 * Values are objects mapping event names to script bodies.
 */
export type SacEventsMap = Record<string, Record<string, string>>;


export function isSacStoryContent(value: unknown): value is SacStoryContent {
    if (!value || typeof value !== 'object') return false;
    const obj = value as Record<string, unknown>;
    return typeof obj.version === 'number' &&
        (Array.isArray(obj.entities) || (obj.entities !== null && typeof obj.entities === 'object'));
}


export function isSacAppEntity(entity: SacEntity): entity is SacAppEntity {
    return entity !== null &&
        typeof entity === 'object' &&
        ('app' in entity || 'names' in entity || 'scriptObjects' in entity);
}


export function isSacStoryEntity(entity: SacEntity): entity is SacStoryEntity {
    return entity !== null &&
        typeof entity === 'object' &&
        (entity as SacGenericEntity).type === 'story';
}

/**
 * Safely parse potential script object instance ID.
 * Instance IDs are JSON strings like `[{"scriptObject":"GUID"}]`
 * @returns The extracted GUID or the original ID if not parseable
 */
export function parseScriptObjectId(instanceId: string): string {
    try {
        if (instanceId.includes('scriptObject')) {
            const parsed = JSON.parse(instanceId);
            if (Array.isArray(parsed) && parsed[0]?.scriptObject) {
                return parsed[0].scriptObject;
            }
        }
    } catch {
        // Not valid JSON, return as-is
    }
    return instanceId;
}


export interface SacUpdateContentParams {
    resourceId: string;
    name: string;
    description: string;
    /** The story content object (NOT the cdata wrapper) */
    content: SacStoryContent;
    /** Version counter for optimistic locking */
    localVer?: number;
}
