import { z } from "zod";

export const inputSchema = {
  path: z
    .string()
    .describe(
      "Documentation path from the llms.txt index (e.g., '/docs/app/api-reference/functions/refresh'). You MUST get this path from the nextjs-docs://llms-index resource. App Router only — Pages Router paths ('/docs/pages/...') are not supported.",
    ),
  anchor: z
    .string()
    .optional()
    .describe(
      "Optional anchor/section from the index (e.g., 'usage'). Included in response metadata to indicate relevant section.",
    ),
};

type NextjsDocsArgs = {
  path: string;
  anchor?: string;
};

export const metadata = {
  name: "nextjs_docs",
  description: `Fetch Next.js official documentation by path. Scoped to App Router on Next.js 16; Pages Router paths are rejected.

IMPORTANT: You MUST first read the \`nextjs-docs://llms-index\` MCP resource to get the correct path. Do NOT guess paths.

Workflow:
1. Read the \`nextjs-docs://llms-index\` resource to get the documentation index
2. Find the relevant path in the index for what you're looking for
3. Call this tool with that exact path

Example:
  nextjs_docs({ path: "/docs/app/api-reference/functions/refresh" })`,
};

export async function handler({
  path,
  anchor,
}: NextjsDocsArgs): Promise<string> {
  if (path.startsWith("/docs/pages/")) {
    return JSON.stringify({
      error: "PAGES_ROUTER_NOT_SUPPORTED",
      message: `Pages Router paths are not supported by this tool. The Citadel Next.js docs tool covers App Router on Next.js 16 only. If you need App Router docs for the same topic, read the \`nextjs-docs://llms-index\` resource and find the equivalent \`/docs/app/...\` path.`,
    });
  }

  const url = `https://nextjs.org${path}`;
  const response = await fetch(url, {
    headers: {
      Accept: "text/markdown",
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return JSON.stringify({
        error: "NOT_FOUND",
        message: `Documentation not found at path: "${path}". This path may be outdated. Please read the \`nextjs-docs://llms-index\` resource to find the current correct path.`,
      });
    }
    throw new Error(
      `Failed to fetch documentation: ${response.status} ${response.statusText}`,
    );
  }

  const markdown = await response.text();
  return JSON.stringify({
    path,
    anchor: anchor || null,
    url: anchor
      ? `https://nextjs.org${path}#${anchor}`
      : `https://nextjs.org${path}`,
    content: markdown,
  });
}
