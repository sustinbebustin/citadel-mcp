// Removes vendor-supplied chrome that wraps llms.txt-style markdown docs.
// Idempotent: each replace is a no-op when the pattern is absent.
export function stripDocChrome(md: string): string {
  return md
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
    .replace(/^> For an index of all [^\n]*\n+/m, "")
    .replace(/\n---\r?\n\r?\nFor a semantic[\s\S]*$/m, "")
    .trim();
}
