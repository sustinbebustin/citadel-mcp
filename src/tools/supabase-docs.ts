import { z } from "zod";
import { stripDocChrome } from "../_internal/strip-doc-chrome.js";

export const inputSchema = {
  path: z
    .string()
    .describe(
      "Guide path (e.g., '/docs/guides/functions/auth'). Must start with '/docs/guides/'. Do NOT include a '.md' suffix — the tool appends it. Get valid paths by calling codemode.supabase_index() first.",
    ),
};

type SupabaseDocsArgs = {
  path: string;
};

export const metadata = {
  name: "supabase_docs",
  description: `Fetch a Supabase guide by path. Scoped to /docs/guides/** content.

IMPORTANT: Call codemode.supabase_index() first to get valid paths. Do NOT guess paths.

Workflow:
1. Call codemode.supabase_index() to get the guides index
2. Find the relevant path(s) in the index
3. Call codemode.supabase_docs({ path }) — no .md suffix, the tool appends it. Fan out parallel fetches with Promise.all when looking up multiple guides at once`,
};

export async function handler({ path }: SupabaseDocsArgs): Promise<string> {
  if (!path.startsWith("/docs/guides/")) {
    return JSON.stringify({
      error: "OUT_OF_SCOPE",
      message: `Path "${path}" is out of scope. The Citadel Supabase docs tool covers /docs/guides/** only. Call codemode.supabase_index() and select a path that starts with "/docs/guides/".`,
    });
  }

  const cleaned = path.replace(/[#?].*$/, "").replace(/\/+$/, "");
  const normalized = cleaned.endsWith(".md") ? cleaned : `${cleaned}.md`;
  const url = `https://supabase.com${normalized}`;
  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      return JSON.stringify({
        error: "NOT_FOUND",
        message: `Documentation not found at path: "${path}". This path may be outdated. Call codemode.supabase_index() to find the current correct path.`,
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
