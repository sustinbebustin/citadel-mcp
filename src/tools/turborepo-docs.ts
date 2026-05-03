import { z } from "zod";

export const inputSchema = {
  path: z
    .string()
    .describe(
      "Documentation path as listed in the llms.txt index (e.g., '/guides/tools/docker.md', '/reference/run.md', or 'index.md'). Paths in the index are relative to '/docs/'; this tool resolves them under turborepo.dev/docs/. You MUST get this path from the turborepo-docs://llms-index resource.",
    ),
};

type TurborepoDocsArgs = {
  path: string;
};

export const metadata = {
  name: "turborepo_docs",
  description: `Fetch Turborepo official documentation by path.

IMPORTANT: You MUST first read the \`turborepo-docs://llms-index\` MCP resource to get the correct path. Do NOT guess paths.

Workflow:
1. Read the \`turborepo-docs://llms-index\` resource to get the documentation index
2. Find the relevant path in the index for what you're looking for (paths include the .md suffix)
3. Call this tool with that exact path

Example:
  turborepo_docs({ path: "/guides/tools/docker.md" })`,
};

export async function handler({ path }: TurborepoDocsArgs): Promise<string> {
  const trimmed = path.replace(/^\/+/, "");
  const url = `https://turborepo.dev/docs/${trimmed}`;
  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      return JSON.stringify({
        error: "NOT_FOUND",
        message: `Documentation not found at path: "${path}". This path may be outdated. Please read the \`turborepo-docs://llms-index\` resource to find the current correct path.`,
      });
    }
    throw new Error(
      `Failed to fetch documentation: ${response.status} ${response.statusText}`,
    );
  }

  const markdown = await response.text();
  return JSON.stringify({
    path,
    url,
    content: markdown,
  });
}
