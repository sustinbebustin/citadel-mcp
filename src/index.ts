#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
// Runtime imports from "@cloudflare/codemode" are unsafe — its index.js
// transitively imports "cloudflare:workers" which Node cannot resolve.
// Types are erased at compile time, so `import type` is safe.
import type { Executor } from "@cloudflare/codemode";
import { z } from "zod";
import pkg from "../package.json" with { type: "json" };

import * as nextjsDocs from "./tools/nextjs-docs.js";
import * as reactDocs from "./tools/react-docs.js";
import * as turborepoDocs from "./tools/turborepo-docs.js";
import * as supabaseDocs from "./tools/supabase-docs.js";
import * as docsSearch from "./tools/docs-search.js";

import * as nextjsDocsLlmsIndex from "./resources/(nextjs-docs)/llms-index.js";
import * as reactDocsLlmsIndex from "./resources/(react-docs)/llms-index.js";
import * as turborepoDocsLlmsIndex from "./resources/(turborepo-docs)/llms-index.js";
import * as supabaseDocsGuidesIndex from "./resources/(supabase-docs)/guides-index.js";

import {
  generateCodemodeTypes,
  buildCodeExample,
  type JsonSchema,
  type ToolDescriptor,
} from "./_internal/generate-codemode-types.js";
import { expandCodeDescription } from "./_internal/code-description.js";
import {
  NodeVMExecutor,
  type ProviderFn,
} from "./_internal/executor.js";

type IndexResource = {
  metadata: { uri: string; name: string; description: string };
  handler: () => Promise<string>;
};

function registerIndexTool(
  server: McpServer,
  toolName: string,
  stackLabel: string,
  fetchPathTool: string,
  resource: IndexResource,
): void {
  server.registerTool(
    toolName,
    {
      description: `Returns the raw ${stackLabel} documentation index. Search this output to find valid paths before calling \`${fetchPathTool}\`. No arguments.`,
    },
    async () => ({
      content: [{ type: "text", text: await resource.handler() }],
    }),
  );
}

// Output shape returned by every per-stack docs tool. Mirroring this in the
// MCP outputSchema gives the sandbox SDK concrete TS types instead of `unknown`.
const docResultSchema = {
  path: z.string(),
  url: z.string().optional(),
  content: z.string().optional(),
  anchor: z.string().nullable().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
};

const docsSearchOutputSchema = {
  matches: z.array(
    z.object({
      stack: z.string(),
      path: z.string(),
      url: z.string(),
      title: z.string(),
      description: z.string().optional(),
      score: z.number(),
      content: z.string().optional(),
      error: z.string().optional(),
    }),
  ),
};

async function registerDocsTool<Args>(
  server: McpServer,
  metadata: { name: string; description: string },
  inputSchema: Record<string, z.ZodTypeAny>,
  handler: (args: Args) => Promise<string>,
  outputSchema: Record<string, z.ZodTypeAny> = docResultSchema,
): Promise<void> {
  server.registerTool(
    metadata.name,
    {
      description: metadata.description,
      inputSchema,
      outputSchema,
    },
    async (args: unknown) => {
      const text = await handler(args as Args);
      const data = JSON.parse(text) as Record<string, unknown>;
      return {
        content: [{ type: "text", text }],
        structuredContent: data,
      };
    },
  );
}

async function createUpstream(): Promise<McpServer> {
  const server = new McpServer({
    name: "citadel-mcp",
    version: pkg.version,
  });

  await registerDocsTool(
    server,
    nextjsDocs.metadata,
    nextjsDocs.inputSchema,
    nextjsDocs.handler,
  );
  await registerDocsTool(
    server,
    reactDocs.metadata,
    reactDocs.inputSchema,
    reactDocs.handler,
  );
  await registerDocsTool(
    server,
    turborepoDocs.metadata,
    turborepoDocs.inputSchema,
    turborepoDocs.handler,
  );
  await registerDocsTool(
    server,
    supabaseDocs.metadata,
    supabaseDocs.inputSchema,
    supabaseDocs.handler,
  );

  const indexLoaders: Record<string, () => Promise<string>> = {
    nextjs: nextjsDocsLlmsIndex.handler,
    react: reactDocsLlmsIndex.handler,
    turborepo: turborepoDocsLlmsIndex.handler,
    supabase: supabaseDocsGuidesIndex.handler,
  };
  const stackDocsHandlers: Record<
    string,
    (args: { path: string }) => Promise<string>
  > = {
    nextjs: (args) => nextjsDocs.handler(args),
    react: (args) => reactDocs.handler(args),
    turborepo: (args) => turborepoDocs.handler(args),
    supabase: (args) => supabaseDocs.handler(args),
  };
  const knownStacks = Object.keys(indexLoaders);

  await registerDocsTool(
    server,
    docsSearch.metadata,
    docsSearch.inputSchema,
    async (args: Parameters<typeof docsSearch.handler>[0]) =>
      docsSearch.handler(args, {
        loadIndex: async (stack) => {
          const loader = indexLoaders[stack];
          if (!loader) throw new Error(`Unknown stack: ${stack}`);
          return loader();
        },
        fetchDoc: async (stack, path) => {
          const fn = stackDocsHandlers[stack];
          if (!fn) throw new Error(`Unknown stack: ${stack}`);
          return fn({ path });
        },
        knownStacks,
      }),
    docsSearchOutputSchema,
  );

  registerIndexTool(
    server,
    "nextjs_index",
    "Next.js (App Router, Next.js 16)",
    "nextjs_docs",
    nextjsDocsLlmsIndex,
  );
  registerIndexTool(
    server,
    "react_index",
    "React",
    "react_docs",
    reactDocsLlmsIndex,
  );
  registerIndexTool(
    server,
    "turborepo_index",
    "Turborepo",
    "turborepo_docs",
    turborepoDocsLlmsIndex,
  );
  registerIndexTool(
    server,
    "supabase_index",
    "Supabase guides",
    "supabase_docs",
    supabaseDocsGuidesIndex,
  );

  return server;
}

function formatResultText(result: unknown): string {
  if (typeof result === "string") return result;
  return JSON.stringify(result, null, 2) ?? "undefined";
}

async function buildCodeServer(
  upstream: McpServer,
  executor: Executor,
): Promise<McpServer> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await upstream.connect(serverTransport);
  const client = new Client({
    name: "citadel-codemode-proxy",
    version: pkg.version,
  });
  await client.connect(clientTransport);

  const { tools } = await client.listTools();
  const descriptors: ToolDescriptor[] = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema as JsonSchema,
    outputSchema: tool.outputSchema as JsonSchema | undefined,
  }));
  const fns: Record<string, ProviderFn> = {};
  for (const tool of tools) {
    const toolName = tool.name;
    fns[toolName] = async (args: unknown) =>
      client.callTool({
        name: toolName,
        arguments: args as Record<string, unknown> | undefined,
      });
  }
  const description = expandCodeDescription({
    types: generateCodemodeTypes(descriptors),
    example: buildCodeExample(descriptors),
  });

  const code = new McpServer({ name: "citadel-mcp", version: pkg.version });
  code.registerTool(
    "code",
    {
      description,
      inputSchema: {
        code: z
          .string()
          .describe("JavaScript async arrow function to execute"),
      },
    },
    async ({ code: source }) => {
      const r = await executor.execute(source, [{ name: "codemode", fns }]);
      const content: Array<{ type: "text"; text: string }> = [];
      if (r.error) {
        content.push({ type: "text", text: `Error: ${r.error}` });
      } else {
        content.push({ type: "text", text: formatResultText(r.result) });
      }
      if (r.logs && r.logs.length > 0) {
        content.push({
          type: "text",
          text: `[logs]\n${r.logs.join("\n")}`,
        });
      }
      return r.error ? { content, isError: true } : { content };
    },
  );
  return code;
}

async function main() {
  const upstream = await createUpstream();
  const executor = new NodeVMExecutor();
  const server = await buildCodeServer(upstream, executor);
  await server.connect(new StdioServerTransport());

  const shutdown = () => {
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.error(`[citadel-mcp] ready (v${pkg.version})`);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
