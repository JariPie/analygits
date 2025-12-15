import { type ParsedStoryContent } from './sacParser';
import { type TreeItem, type FileDiff, getFileContent } from '../services/githubService';

// --- Types ---

export interface VirtualFile {
    path: string;
    content: string;
}

// --- Convert Parsed Story to Virtual File Tree ---

export function storyToVirtualTree(parsedContent: ParsedStoryContent): Map<string, string> {
    const tree = new Map<string, string>();

    const storyName = parsedContent.name?.replace(/\s+/g, '_') || 'story';
    const basePath = `stories/${storyName}`;

    // README with story metadata
    let readmeContent = `# ${parsedContent.name || 'Untitled Story'}\n\n`;
    if (parsedContent.description) {
        readmeContent += `${parsedContent.description}\n\n`;
    }
    readmeContent += `## Pages\n\n`;
    if (parsedContent.pages && parsedContent.pages.length > 0) {
        for (const page of parsedContent.pages) {
            readmeContent += `- **${page.title}** (\`${page.id}\`)\n`;
        }
    } else {
        readmeContent += `_No pages found._\n`;
    }

    tree.set(`${basePath}/README.md`, readmeContent);

    // Global Variables
    if (parsedContent.globalVars && parsedContent.globalVars.length > 0) {
        let globalVarsContent = `// Global Variables for ${parsedContent.name || 'Story'}\n\n`;
        for (const gv of parsedContent.globalVars) {
            globalVarsContent += `/**\n`;
            if (gv.description) {
                globalVarsContent += ` * ${gv.description}\n`;
            }
            globalVarsContent += ` * @type {${gv.type}}\n`;
            globalVarsContent += ` */\n`;
            globalVarsContent += `var ${gv.name};\n\n`;
        }
        tree.set(`${basePath}/globalVars.js`, globalVarsContent);
    }

    // Script Objects
    if (parsedContent.scriptObjects && parsedContent.scriptObjects.length > 0) {
        for (const so of parsedContent.scriptObjects) {
            let scriptContent = `// Script Object: ${so.name}\n\n`;
            for (const fn of so.functions) {
                scriptContent += `/**\n`;
                scriptContent += ` * ${fn.name}\n`;
                scriptContent += ` */\n`;
                scriptContent += `${fn.body}\n\n`;
            }
            tree.set(`${basePath}/scripts/${so.name}.js`, scriptContent);
        }
    }

    // Events (grouped by widget)
    if (parsedContent.events && parsedContent.events.length > 0) {
        const eventsByWidget = new Map<string, typeof parsedContent.events>();
        for (const evt of parsedContent.events) {
            const widgetName = evt.widgetName || evt.widgetId;
            if (!eventsByWidget.has(widgetName)) {
                eventsByWidget.set(widgetName, []);
            }
            eventsByWidget.get(widgetName)!.push(evt);
        }

        for (const [widgetName, events] of eventsByWidget) {
            let eventContent = `// Events for ${widgetName}\n\n`;
            for (const evt of events) {
                eventContent += `// ${evt.eventName}\n`;
                eventContent += `${evt.body}\n\n`;
            }
            tree.set(`${basePath}/events/${widgetName.replace(/\s+/g, '_')}.js`, eventContent);
        }
    }

    return tree;
}

// --- Build Remote Tree Map from GitHub Tree ---

export function buildRemoteTreeMap(treeItems: TreeItem[]): Map<string, { sha: string; size?: number }> {
    const map = new Map<string, { sha: string; size?: number }>();
    for (const item of treeItems) {
        if (item.type === 'blob') {
            map.set(item.path, { sha: item.sha, size: item.size });
        }
    }
    return map;
}

// --- Compute Diffs Between Local and Remote ---

export async function computeDiffs(
    localTree: Map<string, string>,
    remoteTreeMap: Map<string, { sha: string; size?: number }>,
    accessToken: string,
    owner: string,
    repo: string
): Promise<FileDiff[]> {
    const diffs: FileDiff[] = [];
    const remotePathsHandled = new Set<string>();

    // Check for added/modified files
    for (const [path, localContent] of localTree) {
        const remote = remoteTreeMap.get(path);

        if (!remote) {
            // File is new
            diffs.push({
                path,
                status: 'added',
                newContent: localContent,
            });
        } else {
            remotePathsHandled.add(path);

            // Fetch remote content to compare
            try {
                const remoteContent = await getFileContent(accessToken, owner, repo, remote.sha);
                if (remoteContent !== localContent) {
                    diffs.push({
                        path,
                        status: 'modified',
                        oldContent: remoteContent,
                        newContent: localContent,
                        sha: remote.sha,
                    });
                }
                // If content is the same, no diff needed
            } catch (err) {
                console.warn(`Failed to fetch remote content for ${path}:`, err);
                // Treat as modified if we can't compare
                diffs.push({
                    path,
                    status: 'modified',
                    newContent: localContent,
                    sha: remote.sha,
                });
            }
        }
    }

    // Check for deleted files (files in remote but not in local, within the story's basePath)
    // We only consider deletions within paths that start with "stories/"
    for (const [remotePath, { sha }] of remoteTreeMap) {
        if (!remotePathsHandled.has(remotePath) && remotePath.startsWith('stories/')) {
            // Check if this file is within a story directory that we're managing
            const localPaths = Array.from(localTree.keys());
            const storyBasePaths = new Set(localPaths.map(p => p.split('/').slice(0, 2).join('/')));
            const remoteStoryPath = remotePath.split('/').slice(0, 2).join('/');

            if (storyBasePaths.has(remoteStoryPath)) {
                diffs.push({
                    path: remotePath,
                    status: 'deleted',
                    sha,
                });
            }
        }
    }

    return diffs;
}
