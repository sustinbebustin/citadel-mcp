import { z } from "zod";
import { stripDocChrome } from "../_internal/strip-doc-chrome.js";

export const inputSchema = {
  path: z
    .string()
    .describe(
      "Documentation path from the index (e.g., '/docs/guide/usage/linter/automatic-fixes.md'). Paths already include the '.md' suffix as listed in the index. Get valid paths by calling codemode.oxc_index() first.",
    ),
};

type OxcDocsArgs = {
  path: string;
};

export const metadata = {
  name: "oxc_docs",
  description: `Fetch Oxc (Oxlint + Oxfmt) official documentation by path.

IMPORTANT: Call codemode.oxc_index() first to get valid paths. Do NOT guess paths.

Workflow:
1. Call codemode.oxc_index() to get the documentation index
2. Find the relevant path(s) in the index (paths include the .md suffix)
3. Call codemode.oxc_docs({ path }) — fan out parallel fetches with Promise.all when looking up multiple docs at once`,
};

export async function handler({ path }: OxcDocsArgs): Promise<string> {
  if (!path.startsWith("/")) {
    return JSON.stringify({
      error: "OUT_OF_SCOPE",
      message: `Path "${path}" must be an absolute oxc.rs path beginning with "/". Call codemode.oxc_index() and use a path exactly as listed there.`,
    });
  }

  const url = `https://oxc.rs${path}`;
  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      return JSON.stringify({
        error: "NOT_FOUND",
        message: `Documentation not found at path: "${path}". This path may be outdated. Call codemode.oxc_index() to find the current correct path.`,
      });
    }
    throw new Error(
      `Failed to fetch documentation: ${response.status} ${response.statusText}`,
    );
  }

  const markdown = stripDocChrome(await response.text());
  return JSON.stringify({ path, url, content: markdown });
}
