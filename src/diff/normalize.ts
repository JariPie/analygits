/**
 * Normalizes script content to ensure deterministic diffs.
 * Rules:
 * - Convert CRLF -> LF
 * - Trim trailing whitespace per line
 * - Ensure exactly one newline at EOF
 * - Empty content normalizes to "\n"
 */
export function normalizeContent(input: string): string {
    if (!input) {
        return "\n";
    }

    // 1. Convert CRLF to LF
    let normalized = input.replace(/\r\n/g, "\n");

    // 2. Split lines
    const lines = normalized.split("\n");

    // 3. Trim trailing whitespace per line
    const trimmedLines = lines.map(line => line.trimEnd());

    // 4. Join back with LF
    normalized = trimmedLines.join("\n");

    // 5. Ensure exactly one newline at EOF
    if (!normalized.endsWith("\n")) {
        normalized += "\n";
    }

    // Handle case where we might have multiple trailing newlines? 
    // Requirement says "Ensure exactly one newline at EOF".
    // If we assume the input might have multiple, we might want to trim end and add one.
    // But strictly following "Trim trailing whitespace per line" handles horizontal whitespace.
    // Let's interpret "Ensure exactly one newline at EOF" as strictly trailing newline.
    // But wait, if the file ends with "\n\n", splitting gives empty string at end.
    // "Trim trailing whitespace per line" on empty string is empty string.
    // Join gives "\n\n". 
    // Usually editors want one final newline.
    // Let's strip trailing newlines and add one.

    normalized = normalized.replace(/\n+$/, "") + "\n";

    return normalized;
}
