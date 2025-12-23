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

    let normalized = input.replace(/\r\n/g, "\n");

    const lines = normalized.split("\n");

    const trimmedLines = lines.map(line => line.trimEnd());

    normalized = trimmedLines.join("\n");

    // Ensure exactly one newline at EOF - strip all trailing newlines and add one
    normalized = normalized.replace(/\n+$/, "") + "\n";

    return normalized;
}
