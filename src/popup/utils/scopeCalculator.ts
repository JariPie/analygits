/**
 * Calculates the "deepest shared scope" from a list of file paths.
 * The scope is defined as the last segment of the longest common directory prefix.
 *
 * Examples:
 * - ["a/b/c", "a/b/d"] -> common prefix: "a/b" -> scope: "b"
 * - ["stories/S1/scripts/A", "stories/S1/scripts/B"] -> common: "stories/S1/scripts" -> scope: "scripts"
 * - ["a/b/c", "x/y/z"] -> common: "" -> scope: undefined
 * - [] -> scope: undefined
 */
export function getDeepestSharedScope(paths: string[]): string | undefined {
    if (!paths || paths.length === 0) {
        return undefined;
    }

    // Split paths into segments
    const splitPaths = paths.map(p => p.split('/'));

    // Find shortest path length to avoid out of bounds
    const minLength = Math.min(...splitPaths.map(p => p.length));

    let commonPrefixLength = 0;

    for (let i = 0; i < minLength; i++) {
        const segment = splitPaths[0][i];
        const allMatch = splitPaths.every(p => p[i] === segment);
        if (allMatch) {
            commonPrefixLength++;
        } else {
            break;
        }
    }

    if (commonPrefixLength === 0) {
        return undefined;
    }

    // The common prefix is splitPaths[0].slice(0, commonPrefixLength)
    // The scope is the last segment of that prefix.
    // However, if the common prefix IS the file itself (e.g. only one file selected),
    // we usually want the parent folder as scope, not the filename.
    // BUT the requirement says "deepest shared path".
    // If I select "a/b/c" (file), common prefix is "a/b/c".
    // Should the scope be "c" (filename) or "b" (parent)?
    // Usually commit scopes are about components/modules, not specific files.
    // Let's look at the user example:
    // "stories/Sales_Story/scripts/global/ScriptObject_1/functions" (folder?)
    // "stories/Sales_Story/scripts/widgets/Page_1/onInitialize" (file?)
    // User says scope "scripts".
    // Common prefix: "stories/Sales_Story/scripts" (3 segments). Scope is 3rd segment: "scripts".

    // Example 2:
    // "stories/Sales_Story/scripts/widgets/Page_1/onInitialize"
    // "stories/Sales_Story/scripts/widgets/Page_1/onActive"
    // Common prefix: "stories/Sales_Story/scripts/widgets/Page_1". Scope is "Page_1".

    // Seems valid.
    // What if we select just one file? "a/b/c.ts"
    // Common prefix "a/b/c.ts". Last segment "c.ts".
    // Typically scope is not the filename with extension.
    // If the common prefix points to a file (implied by typical behavior), maybe we should look at its parent?
    // However, the function operates on strings. It doesn't know if "functions" is a file or folder.
    // In the user example, "functions" looks like a folder or a script file without extension.

    // Let's implement strictly as "last segment of common prefix".
    // IF the resulting scope has an extension (contains '.'), maybe strip it?
    // The user didn't specify, but `c.ts` as scope is weird. `c` is better.
    // Let's leave it simple for now: last segment.

    // If the common prefix length covers the entire path of one of the inputs,
    // it means one path is a folder containing the other, or they are identical.
    // e.g. "a/b" and "a/b/c". Common "a/b". Scope "b".

    return splitPaths[0][commonPrefixLength - 1];
}
