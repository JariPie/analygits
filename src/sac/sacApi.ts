
interface GetContentData {
    resourceId: string;
    resourceType: string;
    name: string;
    description: string;
    cdata: {
        content?: any; // Full story content object (version, entities, scriptObjects, etc.)
        contentOptimized?: any; // Alternative location for content in unified stories
        [key: string]: any;
    };
    updateCounter?: number;
    [key: string]: any;
}

export interface GetContentResponse {
    resource: GetContentData;
}

export interface UpdateContentParams {
    resourceId: string;
    name: string;
    description: string;
    content: any;
    localVer?: number;
}

// Helper to send messages to background script
async function sendBackgroundMessage(type: string, payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type, ...payload }, (response) => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            if (!response) {
                return reject(new Error("No response from background script"));
            }
            if (!response.ok) {
                return reject(new Error(response.error || "Unknown background error"));
            }
            resolve(response.data);
        });
    });
}

// Helper to get current SAC origin
async function getSacBaseUrl(): Promise<string> {
    // In a popup, we want the active tab of the current window (which is the SAC page)
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length || !tabs[0].url) {
        throw new Error("Could not determine active tab URL");
    }
    return new URL(tabs[0].url).origin;
}

/**
 * Validates that content is the story content object (resource.cdata.content),
 * not the wrapper cdata object.
 */
function validateContentStructure(content: any): void {
    if (!content) {
        throw new Error("Content is null/undefined. Expected resource.cdata.content.");
    }
    if (!content.version) {
        throw new Error(
            "Invalid content: missing 'version'. You are sending wrapper cdata; must send resource.cdata.content."
        );
    }
    if (!Array.isArray(content.entities)) {
        throw new Error(
            "Invalid content: 'entities' must be an array. You are sending wrapper cdata; must send resource.cdata.content."
        );
    }
}

export function extractStoryContent(cdata: any): any {
    if (!cdata) return null;

    const parseIfString = (value: any): any => {
        if (typeof value === 'string') {
            try {
                console.log("[sacApi] extractStoryContent - Parsing JSON string content, length:", value.length);
                const parsed = JSON.parse(value);
                console.log("[sacApi] extractStoryContent - Parsed content keys:", Object.keys(parsed));
                console.log("[sacApi] extractStoryContent - Parsed content details:", {
                    version: parsed.version,
                    entitiesCount: Array.isArray(parsed.entities) ? parsed.entities.length : 'not array',
                    hasScriptObjects: !!parsed.scriptObjects,
                    scriptObjectsCount: Array.isArray(parsed.scriptObjects) ? parsed.scriptObjects.length : 'N/A',
                    topLevelKeys: Object.keys(parsed)
                });
                return parsed;
            } catch (e) {
                console.error("[sacApi] extractStoryContent - Failed to parse string content:", e);
                return null;
            }
        }
        return value;
    };

    // Check for optimized content first
    if (cdata.contentOptimized) {
        const parsed = parseIfString(cdata.contentOptimized);
        if (parsed && (parsed.version || parsed.entities)) {
            console.log("[sacApi] extractStoryContent - Found content at contentOptimized");
            return parsed;
        }
    }

    // Check for content location
    if (cdata.content) {
        const parsed = parseIfString(cdata.content);
        if (parsed && (parsed.version || parsed.entities || parsed.scriptObjects)) {
            console.log("[sacApi] extractStoryContent - Found content at content");
            return parsed;
        }
    }

    // Check if cdata itself IS the content
    if (cdata.version && cdata.entities) {
        console.log("[sacApi] extractStoryContent - cdata itself is the content");
        return cdata;
    }

    if (Array.isArray(cdata.entities)) {
        console.log("[sacApi] extractStoryContent - cdata has entities array directly");
        return cdata;
    }

    console.warn("[sacApi] extractStoryContent - Could not find content. Keys:", Object.keys(cdata));
    return null;
}

/**
 * Fetches the full story content from SAC.
 * Returns the full response including:
 * - resource.resourceId
 * - resource.name
 * - resource.description
 * - resource.cdata (contains contentOptimized or content)
 * - resource.updateCounter (for optimistic locking)
 * 
 * Use extractStoryContent(resource.cdata) to get the actual content object.
 */
export async function getContent(storyId: string): Promise<GetContentResponse> {
    const baseUrl = await getSacBaseUrl();
    const messagePayload = {
        url: `${baseUrl}/sap/fpa/services/rest/epm/contentlib?tenant=0`,
        method: "POST",
        body: {
            action: "getContent",
            data: {
                resourceType: "STORY",
                resourceId: storyId,
                oOpt: {
                    fetchDefaultBookmark: true,
                    sTranslationLocale: "en",
                    propertyBag: true,
                    presentationId: storyId,
                    isStory: true,
                    isStory2: true,
                    fetchTheme: true,
                    fetchComposite: true,
                    optimized: true
                },
                bIncDependency: false
            }
        }
    };

    console.log("[sacApi] getContent - Sending POST payload:", messagePayload.body);

    const responseText = await sendBackgroundMessage("FETCH_DATA", messagePayload);

    console.log("[sacApi] getContent - Raw responseText length:", responseText?.length);

    if (responseText === undefined || responseText === null || responseText === "undefined") {
        throw new Error(`[sacApi] Received empty/undefined response from SAC. Please check background logs.`);
    }

    if (typeof responseText !== 'string') {
        console.warn("[sacApi] responseText is not a string:", typeof responseText);
        if (typeof responseText === 'object') {
            const resp = responseText as any;
            if (resp.resourceId) return { resource: resp } as GetContentResponse;
            if (resp.resource) return resp as GetContentResponse;
        }
        throw new Error(`Invalid response type from background: ${typeof responseText}`);
    }

    try {
        const json = JSON.parse(responseText);

        // SAC returns the resource object directly for this endpoint
        if (json && json.resourceId) {
            console.log("[sacApi] getContent - Received resource:", {
                resourceId: json.resourceId,
                name: json.name,
                hasCdata: !!json.cdata,
                hasCdataContent: !!json.cdata?.content,
                hasCdataContentOptimized: !!json.cdata?.contentOptimized,
                updateCounter: json.updateCounter
            });
            return { resource: json } as GetContentResponse;
        }

        // Fallback: Check if it's already wrapped
        if (json && json.resource) {
            return json as GetContentResponse;
        }

        if (!json) {
            throw new Error("Empty response from SAC");
        }

        throw new Error("Invalid response content from SAC: missing resourceId");
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new Error("Failed to parse SAC response: " + message);
    }
}

export async function updateContent(params: UpdateContentParams): Promise<any> {
    const { resourceId, name, description, content, localVer } = params;

    // Guardrails - ensure we're sending content, not wrapper cdata
    validateContentStructure(content);

    // Calculate content size (SAC expects this)
    const contentString = JSON.stringify(content);
    const contentSize = contentString.length;

    console.log("[sacApi] updateContent - Validated content structure:", {
        version: content.version,
        entitiesCount: Array.isArray(content.entities) ? content.entities.length : Object.keys(content.entities || {}).length,
        hasScriptObjects: !!content.scriptObjects,
        localVer,
        contentSize
    });

    // Construct payload - cdata is the raw content object
    const payload = {
        action: "updateContent",
        data: {
            resourceId,
            name,
            description,
            cdata: content, // This is resource.cdata.content, the raw story object
            mobileSupport: 1,
            updateOpt: {
                dataChangeInsightsSupport: {
                    value: 0
                },
                enhancedProperties: {
                    STORY_OPTIMIZED_INFO: "VIEW_EDIT_STORY2",
                    DEFAULT_VIEW_MODE: "view",
                    CONTENT_SIZE: String(contentSize)
                },
                contentOnly: true,
                ignoreVersion: false,
                localVer: localVer ?? 1,  // Use provided version or default to 1
                importPageDetails: [],
                fetchImportPageDetails: true,
                ignoreSizeLimit: true
            },
            fetchOpt: {
                bIncDependency: false,
                bIncSubItems: false
            }
        }
    };

    const headers = {
        "content-type": "application/json;charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
        "x-sap-story-payload-bypass": "true"
    };

    const baseUrl = await getSacBaseUrl();
    const url = `${baseUrl}/sap/fpa/services/rest/epm/contentlib?tenant=0`;

    console.log("[sacApi] updateContent - Sending to:", url);
    console.log("[sacApi] updateContent - Payload updateOpt:", payload.data.updateOpt);

    console.log("[sacApi] updateContent - About to send:", {
        url,
        method: "POST",
        hasHeaders: !!headers,
        hasBody: !!payload,
        bodyKeys: Object.keys(payload),
        bodyDataKeys: Object.keys(payload.data),
        bodySize: JSON.stringify(payload).length
    });

    try {
        const resText = await sendBackgroundMessage("FETCH_DATA", {
            url,
            method: "POST",
            headers,
            body: payload
        });

        // Check if response looks like HTML error page
        if (typeof resText === 'string' && resText.trim().startsWith('<!')) {
            console.error("[sacApi] updateContent failed - Received HTML error page:", resText.substring(0, 500));
            throw new Error(`SAC returned HTML error page. First 500 chars: ${resText.substring(0, 500)}`);
        }

        const json = JSON.parse(resText);

        // Check for application-level errors
        if (json.error) {
            console.error("[sacApi] updateContent - SAC error:", json.error);
            throw new Error(JSON.stringify(json.error));
        }

        console.log("[sacApi] updateContent - Success");
        return json;
    } catch (e: any) {
        // Log meaningful error info
        const errorMsg = e.message || String(e);
        console.error("[sacApi] updateContent failed:", errorMsg);
        throw e;
    }
}

/**
 * No-op save test for debugging.
 * Fetches content and immediately saves it unchanged.
 * If this fails, the problem is headers/auth/CSRF/edit-mode, not patching.
 */
export async function testNoOpSave(storyId: string): Promise<{ success: boolean; error?: string; details?: any }> {
    console.log("[sacApi] testNoOpSave - Starting no-op save test for story:", storyId);

    try {
        // 1. Fetch current content
        const { resource } = await getContent(storyId);

        console.log("[sacApi] testNoOpSave - Resource fetched:", {
            resourceId: resource.resourceId,
            name: resource.name,
            updateCounter: resource.updateCounter,
            cdataKeys: Object.keys(resource.cdata || {})
        });

        // 2. Extract the content object using our helper
        const content = extractStoryContent(resource.cdata);
        if (!content) {
            throw new Error("No content found in resource.cdata (checked content, contentOptimized, and direct)");
        }

        // Get version counter
        const localVer = resource.updateCounter ?? resource.cdata?.updateCounter ?? 1;

        console.log("[sacApi] testNoOpSave - Extracted content:", {
            version: content.version,
            entitiesCount: Array.isArray(content.entities) ? content.entities.length : 'not array',
            localVer,
            contentSize: JSON.stringify(content).length
        });

        console.log("[sacApi] testNoOpSave - Saving unchanged content...");

        // 3. Save it back unchanged
        await updateContent({
            resourceId: resource.resourceId,
            name: resource.name,
            description: resource.description ?? "",
            content: content, // Unchanged
            localVer: localVer
        });

        console.log("[sacApi] testNoOpSave - SUCCESS! No-op save worked.");
        return { success: true };
    } catch (e: any) {
        const error = e.message || String(e);
        console.error("[sacApi] testNoOpSave - FAILED:", error);
        return {
            success: false,
            error,
            details: e.stack
        };
    }
}
