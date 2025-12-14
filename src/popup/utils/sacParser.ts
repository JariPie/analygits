export interface SacStoryResponse {
    resource: {
        resourceId: string;
        name: string;
        description: string;
        cdata: {
            content: string; // The stringified JSON
        };
        // Add other fields if needed
    };
}

export interface ScriptVariable {
    id: string;
    name: string;
    description: string;
    type: string;
    isGlobal: boolean;
}

export interface ScriptObjectFunction {
    name: string;
    arguments: any[];
    body: string;
}

export interface ScriptObject {
    id: string;
    name: string;
    functions: ScriptObjectFunction[];
}

export interface WidgetEvent {
    widgetId: string;
    widgetName: string;
    eventName: string;
    body: string;
}

export interface ParsedStoryContent {
    name: string;
    description: string;
    content: any; // The parsed content
    pages: { id: string; title: string }[];
    globalVars: ScriptVariable[];
    scriptObjects: ScriptObject[];
    events: WidgetEvent[];
}

export function extractStoryDetails(innerContent: any): {
    pages: { id: string; title: string }[],
    globalVars: ScriptVariable[],
    scriptObjects: ScriptObject[],
    events: WidgetEvent[]
} {
    const pages: { id: string; title: string }[] = [];
    const globalVars: ScriptVariable[] = [];
    const scriptObjects: ScriptObject[] = [];
    const events: WidgetEvent[] = [];

    // Helper to find name for an ID
    let nameMap: Record<string, string> = {};

    let entities: any = null;
    if (innerContent && typeof innerContent === "object") {
        if (innerContent.entities) {
            entities = innerContent.entities;
        }
    }

    console.log("[SAC Parser] Extracting details. InnerContent keys:", innerContent ? Object.keys(innerContent) : "null");
    console.log("[SAC Parser] Entities found:", entities ? "Yes" : "No", "Type:", Array.isArray(entities) ? "Array" : typeof entities);

    if (entities) {
        let appEntity: any = null;
        let scriptObjectEntities: any[] = [];

        if (Array.isArray(entities)) {
            console.log("[SAC Parser] Entities is Array. Length:", entities.length);

            // LOG ALL ENTITIES TO DEBUG
            entities.forEach((e, idx) => {
                const keys = e ? Object.keys(e) : [];
                const dataKeys = (e && e.data) ? Object.keys(e.data) : [];
                console.log(`[SAC Parser] Entity[${idx}]: id=${e.id}, type=${e.type}. Keys: ${keys.slice(0, 5).join(',')}. DataKeys: ${dataKeys.slice(0, 5).join(',')}`);
            });

            entities.forEach((entity: any) => {
                // Pages - this works
                if (entity.type === "story" && entity.data && Array.isArray(entity.data.pages)) {
                    entity.data.pages.forEach((page: any) => {
                        if (page.id && page.title) {
                            pages.push({ id: page.id, title: page.title });
                        }
                    });
                }

                // Try to find App Entity
                // Heuristic 1: Root level props
                if (entity.globalVars || entity.names) {
                    appEntity = entity;
                }
                // Heuristic 2: 'app' ID or type
                else if (entity.id === 'app' || entity.type === 'Application') {
                    appEntity = entity;
                }
                // Heuristic 3: Nested in data
                else if (entity.data && (entity.data.globalVars || entity.data.names)) {
                    appEntity = entity.data; // Use the data object as the source
                }
                // Heuristic 4: ID ends with :application
                else if (entity.id && entity.id.endsWith(':application')) {
                    appEntity = entity;
                    console.log("[SAC Parser] Found App Entity by ID suffix:", entity.id);
                }
                // Heuristic 5: Has scriptObjects
                else if (entity.scriptObjects) {
                    appEntity = entity;
                    console.log("[SAC Parser] Found App Entity by scriptObjects property.");
                }

                // Script Objects (Standalone entities)
                if (entity.type === "scriptObject" || (entity.id && entity.id.startsWith("ScriptObject_"))) {
                    scriptObjectEntities.push(entity);
                } else if (entity.data && (entity.data.type === "scriptObject" || (entity.data.id && entity.data.id.startsWith("ScriptObject_")))) {
                    scriptObjectEntities.push(entity.data);
                }
            });

        } else if (typeof entities === "object") {
            const keys = Object.keys(entities);
            console.log("[SAC Parser] Entities is Object. Keys sample:", keys.slice(0, 10).join(", "));

            // Entities is a map
            appEntity = entities["app"];

            // Extract pages
            const storyEntity = Object.values(entities).find((e: any) => e.type === "story");
            if (storyEntity && (storyEntity as any).data && Array.isArray((storyEntity as any).data.pages)) {
                (storyEntity as any).data.pages.forEach((page: any) => {
                    if (page.id && page.title) {
                        pages.push({ id: page.id, title: page.title });
                    }
                });
            }

            if (entities.scriptObjects) {
                console.log("[SAC Parser] Found entities.scriptObjects");
                if (Array.isArray(entities.scriptObjects)) {
                    scriptObjectEntities = entities.scriptObjects;
                } else {
                    scriptObjectEntities = Object.values(entities.scriptObjects);
                }
            } else {
                console.log("[SAC Parser] No entities.scriptObjects found. Checking keys...");
                keys.forEach(key => {
                    if (entities[key].type === "scriptObject") {
                        scriptObjectEntities.push(entities[key]);
                    }
                });
            }
            // Check for app entity in object map if not found yet
            if (!appEntity) {
                // Look for key ending in :application
                const appKey = keys.find(k => k.endsWith(':application') || entities[k].scriptObjects);
                if (appKey) appEntity = entities[appKey];
            }
        }


        console.log("[SAC Parser] App Entity found:", appEntity ? "Yes" : "No");

        // Drill down into 'app' property if it exists (common wrapper pattern)
        let appModel = appEntity;
        if (appEntity && appEntity.app) {
            console.log("[SAC Parser] Found nested 'app' property in App Entity. Switching context.");
            appModel = appEntity.app;
            console.log("[SAC Parser] Nested App Model Keys:", Object.keys(appModel));
        }

        // --- Extract Names (Move up to be available for ScriptObjects/Events) ---
        if (appModel && appModel.names) {
            nameMap = appModel.names;
        } else if (appEntity && appEntity.names) {
            nameMap = appEntity.names;
        } else if (entities && entities.app && entities.app.names) {
            nameMap = entities.app.names;
        }
        console.log("[SAC Parser] Names map size:", Object.keys(nameMap).length);


        if (appEntity) {
            // Check if scriptObjects are inside appEntity (wrapper) or appModel (nested)
            // Based on logs, scriptObjects was on the wrapper (appEntity)
            const soSource = appEntity.scriptObjects ? appEntity.scriptObjects : (appModel.scriptObjects ? appModel.scriptObjects : []);

            if (soSource) {
                console.log("[SAC Parser] Extracting scriptObjects. Count:", Object.keys(soSource).length);
                let soList: any[] = [];
                if (Array.isArray(soSource)) {
                    soList = soSource;
                } else {
                    soList = Object.values(soSource);
                }

                soList.forEach((so: any) => {
                    // Handle complex structure: { instanceId: '[{"scriptObject":"GUID"}]', payload: { functionImplementations: {...} } }
                    if (so.payload && so.payload.functionImplementations) {
                        let soId = so.instanceId;
                        let soName = so.instanceId; // Default to complex ID

                        // Try to extract GUID from instanceId string for ID property
                        try {
                            if (soId && soId.includes("scriptObject")) {
                                const parsedId = JSON.parse(soId);
                                if (Array.isArray(parsedId) && parsedId[0] && parsedId[0].scriptObject) {
                                    soId = parsedId[0].scriptObject;
                                }
                            }
                        } catch (e) { /* ignore parse error */ }

                        // Resolve Name: Check instanceId (complex) first, then extracted GUID
                        if (nameMap[so.instanceId]) {
                            soName = nameMap[so.instanceId];
                        } else if (nameMap[soId]) {
                            soName = nameMap[soId];
                        } else {
                            soName = soId; // Fallback to GUID
                        }

                        const functions: ScriptObjectFunction[] = [];
                        Object.entries(so.payload.functionImplementations).forEach(([funcName, funcBody]) => {
                            functions.push({
                                name: funcName,
                                arguments: [], // Signatures are in payload.functionSignatures if needed
                                body: funcBody as string
                            });
                        });

                        scriptObjects.push({
                            id: soId,
                            name: soName,
                            functions: functions
                        });
                    }
                    // Handle standard structure (fallback)
                    else if (so.functions) {
                        const functions: ScriptObjectFunction[] = [];
                        const rawFuncs = Array.isArray(so.functions) ? so.functions : Object.values(so.functions);
                        rawFuncs.forEach((fn: any) => {
                            functions.push({
                                name: fn.name,
                                arguments: fn.arguments || [],
                                body: fn.body || ""
                            });
                        });
                        scriptObjects.push({
                            id: so.id,
                            name: nameMap[so.id] || so.name || so.id,
                            functions: functions
                        });
                    }
                });
            }
        }

        // --- Extract Global Variables ---
        // Likely in appModel
        let rawGlobalVars = [];
        if (appModel && appModel.globalVars) {
            rawGlobalVars = appModel.globalVars;
        } else if (appEntity && appEntity.globalVars) {
            rawGlobalVars = appEntity.globalVars;
        }

        console.log("[SAC Parser] Raw Global Vars found:", Array.isArray(rawGlobalVars) ? rawGlobalVars.length : Object.keys(rawGlobalVars).length);

        if (Array.isArray(rawGlobalVars)) {
            rawGlobalVars.forEach((gv: any) => {
                const gvName = nameMap[gv.id] || nameMap[`[{"scriptVariable":"${gv.id}"}]`] || gv.name || gv.id;
                globalVars.push({
                    id: gv.id,
                    name: gvName,
                    description: gv.description || "",
                    type: gv.type || "unknown",
                    isGlobal: true
                });
            });
        } else if (typeof rawGlobalVars === 'object') {
            Object.values(rawGlobalVars).forEach((gv: any) => {
                const gvName = nameMap[gv.id] || nameMap[`[{"scriptVariable":"${gv.id}"}]`] || gv.name || gv.id;
                globalVars.push({
                    id: gv.id,
                    name: gvName,
                    description: gv.description || "",
                    type: gv.type || "unknown",
                    isGlobal: true
                });
            });
        }

        // --- Extract Events ---
        // Likely in appModel based on structure
        let appEvents = [];
        if (appModel && appModel.events) {
            appEvents = appModel.events;
        } else if (appEntity && appEntity.events) {
            appEvents = appEntity.events;
        }

        console.log("[SAC Parser] App Model Events found:", appEvents ? "Yes" : "No");

        // Logic to process the centralized events map
        // Structure: { '[{"appPage":"GUID"}]': { "onInit": "code" } }
        if (appEvents && Object.keys(appEvents).length > 0) { // Check if appEvents is an object and not empty
            Object.entries(appEvents).forEach(([key, handlers]: [string, any]) => {
                let widgetId = key;
                let widgetName = key;

                // Try to resolve name using the complex key directly (common in SAC)
                if (nameMap[key]) {
                    widgetName = nameMap[key];
                } else {
                    // Try to parse the complex JSON key to find a fallback ID/Name
                    try {
                        if (key.startsWith("[")) {
                            const keyParts = JSON.parse(key);
                            // Extract meaningful ID from the last object key-value pair (most specific)
                            if (Array.isArray(keyParts) && keyParts.length > 0) {
                                const lastPart = keyParts[keyParts.length - 1];
                                const lastType = Object.keys(lastPart)[0];
                                widgetId = lastPart[lastType];

                                // Try looking up by simple ID now
                                if (nameMap[widgetId]) {
                                    widgetName = nameMap[widgetId];
                                } else {
                                    widgetName = widgetId; // Fallback to ID
                                }
                            }
                        }
                    } catch (e) { /* ignore */ }
                }

                Object.entries(handlers).forEach(([eventName, code]) => {
                    events.push({
                        widgetId: widgetId,
                        widgetName: widgetName,
                        eventName: eventName,
                        body: code as string
                    });
                });
            });
        } else {
            // Fallback to legacy scanning if no centralized events map found
            const scanForEvents = (entityList: any[]) => {
                entityList.forEach(entity => {
                    if (entity.events) {
                        let evts = entity.events;
                        if (Array.isArray(evts)) {
                            evts.forEach(e => {
                                events.push({
                                    widgetId: entity.id,
                                    widgetName: nameMap[entity.id] || entity.id,
                                    eventName: e.name || "unknown",
                                    body: e.body || ""
                                });
                            });
                        } else { // Handle object of events
                            Object.values(evts).forEach(e => {
                                events.push({
                                    widgetId: entity.id,
                                    widgetName: nameMap[entity.id] || entity.id,
                                    eventName: (e as any).name || "unknown",
                                    body: (e as any).body || ""
                                });
                            });
                        }
                    }
                    // Check if nested in data too
                    if (entity.data && entity.data.events) {
                        let evts = entity.data.events;
                        if (Array.isArray(evts)) {
                            evts.forEach(e => {
                                events.push({
                                    widgetId: entity.id,
                                    widgetName: nameMap[entity.id] || entity.id,
                                    eventName: e.name || "unknown",
                                    body: e.body || ""
                                });
                            });
                        } else { // Handle object of events
                            Object.values(evts).forEach(e => {
                                events.push({
                                    widgetId: entity.id,
                                    widgetName: nameMap[entity.id] || entity.id,
                                    eventName: (e as any).name || "unknown",
                                    body: (e as any).body || ""
                                });
                            });
                        }
                    }
                });
            };
            if (Array.isArray(entities)) {
                scanForEvents(entities);
            } else if (typeof entities === 'object') {
                scanForEvents(Object.values(entities));
            }
        }
    }

    return { pages, globalVars, scriptObjects, events };
}

export function parseSacStory(jsonString: string): ParsedStoryContent {
    let data;
    try {
        data = JSON.parse(jsonString) as SacStoryResponse;
        console.log("Parsed SAC Response:", data);
    } catch (e) {
        console.error("Raw response:", jsonString);
        throw new Error("Failed to parse initial JSON response from SAC.");
    }

    let resource: any = data;
    if (data.resource) resource = data.resource;

    if (!resource || !resource.cdata) {
        throw new Error("Invalid structure: 'cdata' missing on resource. got: " + JSON.stringify(data).substring(0, 100));
    }
    if (resource.cdata.content === undefined || resource.cdata.content === null) {
        throw new Error("Invalid structure: 'cdata.content' missing.");
    }

    let innerContent: any;
    if (resource.cdata.content === "") {
        innerContent = { message: "Content is empty in the response." };
    } else {
        try {
            innerContent = JSON.parse(resource.cdata.content);
        } catch (e) {
            console.warn("Failed to parse inner content JSON. Returning raw string.");
            innerContent = resource.cdata.content;
        }
    }

    const details = extractStoryDetails(innerContent);

    return {
        name: resource.name,
        description: resource.description,
        content: innerContent,
        ...details
    };
}

export function formatStoryForEditor(parsed: ParsedStoryContent): string {
    const jsonPretty = JSON.stringify(parsed.content, null, 2);

    // Construct sections
    let scriptVarsHtml = "";
    if (parsed.globalVars.length > 0) {
        scriptVarsHtml += "<h3>Global Script Variables</h3><ul>";
        parsed.globalVars.forEach(gv => {
            scriptVarsHtml += `<li><strong>${gv.name}</strong> (${gv.type}): ${gv.description}</li>`;
        });
        scriptVarsHtml += "</ul>";
    }

    let eventsHtml = "";
    if (parsed.events.length > 0) {
        eventsHtml += "<h3>Script Events</h3>";
        parsed.events.forEach(evt => {
            eventsHtml += `<div><h4>${evt.widgetName} - ${evt.eventName}</h4><pre><code>${evt.body}</code></pre></div>`;
        });
    }

    let scriptObjectsHtml = "";
    if (parsed.scriptObjects.length > 0) {
        scriptObjectsHtml += "<h3>Script Objects</h3>";
        parsed.scriptObjects.forEach(so => {
            scriptObjectsHtml += `<h4>${so.name}</h4>`;
            so.functions.forEach(fn => {
                scriptObjectsHtml += `<h5>${fn.name}</h5><pre><code>${fn.body}</code></pre>`;
            });
        });
    }

    return `
        <h1>${parsed.name}</h1>
        <p>${parsed.description}</p>
        <hr />
        ${scriptVarsHtml}
        ${scriptObjectsHtml}
        ${eventsHtml}
        <hr />
        <h3>Story Content Configuration</h3>
        <pre><code>${jsonPretty}</code></pre>
    `;
}

export function formatStoryForGitHub(parsed: ParsedStoryContent): string {
    const jsonPretty = JSON.stringify(parsed.content, null, 2);

    let scriptSection = "";

    if (parsed.globalVars.length > 0) {
        scriptSection += "\n## Global Script Variables\n\n| Name | Type | Description |\n|---|---|---|\n";
        parsed.globalVars.forEach(gv => {
            scriptSection += `| ${gv.name} | ${gv.type} | ${gv.description} |\n`;
        });
    }

    if (parsed.scriptObjects.length > 0) {
        scriptSection += "\n## Script Objects\n";
        parsed.scriptObjects.forEach(so => {
            scriptSection += `\n### ${so.name}\n`;
            so.functions.forEach(fn => {
                scriptSection += `\n#### ${fn.name}\n\n\`\`\`javascript\n${fn.body}\n\`\`\`\n`;
            });
        });
    }

    if (parsed.events.length > 0) {
        scriptSection += "\n## Events\n";
        parsed.events.forEach(evt => {
            scriptSection += `\n### ${evt.widgetName} - ${evt.eventName}\n\n\`\`\`javascript\n${evt.body}\n\`\`\`\n`;
        });
    }

    return `# ${parsed.name}

> ${parsed.description}

${scriptSection}

## Story Content

\`\`\`json
${jsonPretty}
\`\`\`
`;
}
