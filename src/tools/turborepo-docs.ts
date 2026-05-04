import { z } from "zod";
import { stripDocChrome } from "../_internal/strip-doc-chrome.js";

export const inputSchema = {
  path: z
    .string()
    .describe(
      "Documentation path (e.g., '/guides/tools/docker.md', '/reference/run.md', or 'index.md'). Paths are relative to '/docs/'; the tool resolves them under turborepo.dev/docs/. Get valid paths by calling codemode.turborepo_index() first.",
    ),
};

type TurborepoDocsArgs = {
  path: string;
};

export const metadata = {
  name: "turborepo_docs",
  description: `Fetch Turborepo official documentation by path.

IMPORTANT: Call codemode.turborepo_index() first to get valid paths. Do NOT guess paths.

Workflow:
1. Call codemode.turborepo_index() to get the documentation index
2. Find the relevant path(s) in the index (paths include the .md suffix)
3. Call codemode.turborepo_docs({ path }) — fan out parallel fetches with Promise.all when looking up multiple docs at once`,
};

export async function handler({ path }: TurborepoDocsArgs): Promise<string> {
  const trimmed = path.replace(/^\/+/, "");
  const url = `https://turborepo.dev/docs/${trimmed}`;
  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      return JSON.stringify({
        error: "NOT_FOUND",
        message: `Documentation not found at path: "${path}". This path may be outdated. Call codemode.turborepo_index() to find the current correct path.`,
      });
    }
    throw new Error(
      `Failed to fetch documentation: ${response.status} ${response.statusText}`,
    );
  }

  const markdown = stripDocChrome(await response.text());
  return JSON.stringify({
    path,
    url,
    content: markdown,
  });
}
