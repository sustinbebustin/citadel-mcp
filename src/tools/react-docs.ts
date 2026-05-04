import { z } from "zod";
import { stripDocChrome } from "../_internal/strip-doc-chrome.js";

export const inputSchema = {
  path: z
    .string()
    .describe(
      "Documentation path (e.g., '/learn/react-compiler.md' or '/reference/react/useState.md'). The path includes the .md suffix as listed in the index. Get valid paths by calling codemode.react_index() first.",
    ),
};

type ReactDocsArgs = {
  path: string;
};

export const metadata = {
  name: "react_docs",
  description: `Fetch React official documentation by path.

IMPORTANT: Call codemode.react_index() first to get valid paths. Do NOT guess paths.

Workflow:
1. Call codemode.react_index() to get the documentation index
2. Find the relevant path(s) in the index (paths include the .md suffix)
3. Call codemode.react_docs({ path }) — fan out parallel fetches with Promise.all when looking up multiple docs at once`,
};

export async function handler({ path }: ReactDocsArgs): Promise<string> {
  const url = `https://react.dev${path}`;
  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      return JSON.stringify({
        error: "NOT_FOUND",
        message: `Documentation not found at path: "${path}". This path may be outdated. Call codemode.react_index() to find the current correct path.`,
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
