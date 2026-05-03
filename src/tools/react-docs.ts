import { z } from "zod";

export const inputSchema = {
  path: z
    .string()
    .describe(
      "Documentation path from the llms.txt index (e.g., '/learn/react-compiler.md' or '/reference/react/useState.md'). The path includes the .md suffix as listed in the index. You MUST get this path from the react-docs://llms-index resource.",
    ),
};

type ReactDocsArgs = {
  path: string;
};

export const metadata = {
  name: "react_docs",
  description: `Fetch React official documentation by path.

IMPORTANT: You MUST first read the \`react-docs://llms-index\` MCP resource to get the correct path. Do NOT guess paths.

Workflow:
1. Read the \`react-docs://llms-index\` resource to get the documentation index
2. Find the relevant path in the index for what you're looking for (paths include the .md suffix)
3. Call this tool with that exact path

Example:
  react_docs({ path: "/learn/react-compiler.md" })`,
};

export async function handler({ path }: ReactDocsArgs): Promise<string> {
  const url = `https://react.dev${path}`;
  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      return JSON.stringify({
        error: "NOT_FOUND",
        message: `Documentation not found at path: "${path}". This path may be outdated. Please read the \`react-docs://llms-index\` resource to find the current correct path.`,
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
