import { z } from "zod";
import { stripDocChrome } from "../_internal/strip-doc-chrome.js";

export const inputSchema = {
  path: z
    .string()
    .describe(
      "Guide path from the index (e.g., '/docs/guides/functions/auth'). Must start with '/docs/guides/'. Do NOT include a '.md' suffix — the tool appends it. You MUST get this path from the supabase-docs://guides-index resource.",
    ),
};

type SupabaseDocsArgs = {
  path: string;
};

export const metadata = {
  name: "supabase_docs",
  description: `Fetch a Supabase guide by path. Scoped to /docs/guides/** content.

IMPORTANT: You MUST first read the \`supabase-docs://guides-index\` MCP resource to get the correct path. Do NOT guess paths.

Workflow:
1. Read the \`supabase-docs://guides-index\` resource to get the guides index
2. Find the relevant path in the index for what you're looking for
3. Call this tool with that exact path (no .md suffix — the tool appends it)

Example:
  supabase_docs({ path: "/docs/guides/functions/auth" })`,
};

export async function handler({ path }: SupabaseDocsArgs): Promise<string> {
  if (!path.startsWith("/docs/guides/")) {
    return JSON.stringify({
      error: "OUT_OF_SCOPE",
      message: `Path "${path}" is out of scope. The Citadel Supabase docs tool covers /docs/guides/** only. Read the \`supabase-docs://guides-index\` resource and select a path that starts with "/docs/guides/".`,
    });
  }

  const normalized = path.endsWith(".md") ? path : `${path}.md`;
  const url = `https://supabase.com${normalized}`;
  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      return JSON.stringify({
        error: "NOT_FOUND",
        message: `Documentation not found at path: "${path}". This path may be outdated. Please read the \`supabase-docs://guides-index\` resource to find the current correct path.`,
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
