export interface SacStoryResponse {
    resource: {
        resourceId: string;
        name: string;
        description: string;
        cdata: {
            content: string; // The stringified JSON
        };
        // Add other fields if needed, but these are the critical ones for now
    };
}

export interface ParsedStoryContent {
    name: string;
    description: string;
    content: any; // The parsed content
    pages: { id: string; title: string }[];
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

    // Check if it's wrapped in a "resource" property
    if (data.resource) {
        resource = data.resource;
    }

    if (!resource || !resource.cdata) {
        // Fallback or specific error
        throw new Error("Invalid structure: 'cdata' missing on resource. got: " + JSON.stringify(data).substring(0, 100));
    }

    // Content might be empty string, which is falsy in JS. explicitly check for undefined.
    if (resource.cdata.content === undefined || resource.cdata.content === null) {
        throw new Error("Invalid structure: 'cdata.content' missing.");
    }

    let innerContent;
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

    // Extract Pages
    const pages: { id: string; title: string }[] = [];
    if (innerContent && typeof innerContent === "object" && Array.isArray(innerContent.entities)) {
        innerContent.entities.forEach((entity: any) => {
            if (entity.type === "story" && entity.data && Array.isArray(entity.data.pages)) {
                entity.data.pages.forEach((page: any) => {
                    if (page.id && page.title) {
                        pages.push({ id: page.id, title: page.title });
                    }
                });
            }
        });
    }

    return {
        name: resource.name,
        description: resource.description,
        content: innerContent,
        pages: pages
    };
}

export interface ParsedStoryContent {
    name: string;
    description: string;
    content: any;
    pages: { id: string; title: string }[];
}

export function formatStoryForEditor(parsed: ParsedStoryContent): string {
    // We want a pretty printed JSON for the editor
    const jsonPretty = JSON.stringify(parsed.content, null, 2);

    // Wrap in a code block or basic HTML structure for the Tiptap editor
    // If the editor expects HTML:
    return `
        <h1>${parsed.name}</h1>
        <p>${parsed.description}</p>
        <hr />
        <h3>Story Content Configuration</h3>
        <pre><code>${jsonPretty}</code></pre>
    `;
}

export function formatStoryForGitHub(parsed: ParsedStoryContent): string {
    // Markdown format for GitHub
    const jsonPretty = JSON.stringify(parsed.content, null, 2);
    return `# ${parsed.name}

> ${parsed.description}

## Story Content

\`\`\`json
${jsonPretty}
\`\`\`
`;
}
