import type { VirtualTree } from './types';
import { normalizeContent } from './normalize';
import type { ParsedStoryContent } from '../popup/utils/sacParser';

/**
 * Builds the complete virtual tree for a story, including:
 * - README.md (Metadata)
 * - globalVars.js
 * - Scripts (via materialize)
 * 
 * All paths are prefixed with `stories/<StoryName>/`.
 */
export function buildVirtualStoryTree(parsedContent: ParsedStoryContent): VirtualTree {
    const tree: VirtualTree = new Map();

    const storyName = parsedContent.name?.replace(/[\s\/]+/g, '_') || 'story';
    const basePath = `stories/${storyName}`;

    // 1. Generate README.md
    let readme = `# ${parsedContent.name || 'Untitled Story'}\n\n`;
    if (parsedContent.description) {
        readme += `${parsedContent.description}\n\n`;
    }
    readme += `## Pages\n\n`;
    if (parsedContent.pages && parsedContent.pages.length > 0) {
        for (const page of parsedContent.pages) {
            readme += `- **${page.title}** (\`${page.id}\`)\n`;
        }
    } else {
        readme += `_No pages found._\n`;
    }
    const readmePath = `${basePath}/README.md`;
    tree.set(readmePath, { path: readmePath, content: normalizeContent(readme) });

    // 2. Generate globalVars.js
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
        const gvPath = `${basePath}/globalVars.js`;
        tree.set(gvPath, { path: gvPath, content: normalizeContent(globalVarsContent) });
    }

    // 3. Materialize Scripts
    // We pass the RAW generic content if available, or construct a shape
    // materializeSacScripts expects { scriptObjects, events }
    // ParsedStoryContent ALREADY has these extracted as convenient arrays.

    // We can reconstruct the input for materializeSacScripts OR
    // since we already have the arrays in `parsedContent`, we can just iterate them here
    // effectively "inlining" the materialization for the UI context where we have better types.
    // BUT, we should reuse the logic if complex. `materializeSacScripts` handles normalization.

    // Let's use `materializeSacScripts` but we need to map `parsedContent` to the shape it expects.
    // Actually, `materializeSacScripts` was built for the "unknown" JSON.
    // `ParsedStoryContent` is "known". 
    // Let's manually add the scripts using the known structure for best results.

    // 3a. Script Objects
    if (parsedContent.scriptObjects) {
        for (const so of parsedContent.scriptObjects) {
            for (const fn of so.functions) {
                if (!fn.body) continue;
                const path = `${basePath}/scripts/global/${so.name}/${fn.name}.js`;
                tree.set(path, { path, content: normalizeContent(fn.body) });
            }
        }
    }

    // 3b. Events
    if (parsedContent.events) {
        for (const evt of parsedContent.events) {
            if (!evt.body) continue;
            const widgetName = evt.widgetName || evt.widgetId || 'UnknownWidget';
            const eventName = evt.eventName || 'unknownEvent';
            // Sanitize widget name for path
            const safeWidgetName = widgetName.replace(/[\s\/]+/g, '_');

            const path = `${basePath}/scripts/widgets/${safeWidgetName}/${eventName}.js`;
            tree.set(path, { path, content: normalizeContent(evt.body) });
        }
    }

    return tree;
}
