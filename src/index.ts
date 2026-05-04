#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
// Runtime imports from "@cloudflare/codemode" are unsafe — its index.js
// transitively imports "cloudflare:workers" which Node cannot resolve.
// Types are erased at compile time, so `import type` is safe.
import type { Executor, ExecuteResult } from "@cloudflare/codemode";
import { z } from "zod";
import pkg from "../package.json" with { type: "json" };

import * as nextjsDocs from "./tools/nextjs-docs.js";
import * as reactDocs from "./tools/react-docs.js";
import * as turborepoDocs from "./tools/turborepo-docs.js";
import * as supabaseDocs from "./tools/supabase-docs.js";

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

const AsyncFunction: new (...args: string[]) => (
  ...args: unknown[]
) => Promise<unknown> = Object.getPrototypeOf(async function () {}).constructor;

type ProviderFn = (...args: unknown[]) => Promise<unknown>;
type ResolvedProvider = {
  name: string;
  fns: Record<string, ProviderFn>;
  positionalArgs?: boolean;
};

// codeMcpServer hands the executor MCP CallToolResult wrappers
// ({ content: [{type:"text", text}], isError? }). Sandbox code expects parsed
// data and working `try/catch`, so we unwrap and rethrow on isError here.
type McpLikeResult = {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
};
function isMcpLike(v: unknown): v is McpLikeResult {
  return (
    typeof v === "object" &&
    v !== null &&
    Array.isArray((v as { content?: unknown }).content)
  );
}
function unwrapMcpResult(result: unknown): unknown {
  if (!isMcpLike(result)) return result;
  const firstText = result.content?.find((c) => c.type === "text")?.text ?? "";
  if (result.isError) throw new Error(firstText || "Tool returned an error");
  if (firstText === "") return undefined;
  try {
    return JSON.parse(firstText);
  } catch {
    return firstText;
  }
}
function wrapProviderFns(
  fns: Record<string, ProviderFn>,
): Record<string, ProviderFn> {
  const wrapped: Record<string, ProviderFn> = {};
  for (const [key, fn] of Object.entries(fns)) {
    wrapped[key] = async (...args) => unwrapMcpResult(await fn(...args));
  }
  return wrapped;
}

class NodeVMExecutor implements Executor {
  constructor(private readonly timeoutMs: number = 30_000) {}

  // codemode@0.2.x passes ResolvedProvider[]; older releases passed a flat
  // Record<string, fn>. Handle both — the flat form is deprecated.
  async execute(
    code: string,
    providersOrFns: ResolvedProvider[] | Record<string, ProviderFn>,
  ): Promise<ExecuteResult> {
    const logs: string[] = [];
    // Sandbox `console` binding shadows the host's `console` so writes from
    // LLM-generated code never reach process.stdout (owned by StdioServerTransport).
    const consoleProxy = {
      log: (...a: unknown[]) =>
        logs.push(a.map((x) => String(x)).join(" ")),
      error: (...a: unknown[]) =>
        logs.push("[err] " + a.map((x) => String(x)).join(" ")),
      warn: (...a: unknown[]) =>
        logs.push("[warn] " + a.map((x) => String(x)).join(" ")),
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const names: string[] = [];
      const values: unknown[] = [];
      if (Array.isArray(providersOrFns)) {
        for (const p of providersOrFns) {
          names.push(p.name);
          values.push(wrapProviderFns(p.fns));
        }
      } else {
        names.push("codemode");
        values.push(wrapProviderFns(providersOrFns));
      }
      names.push("console");
      values.push(consoleProxy);

      const fn = new AsyncFunction(...names, `return await (${code})()`);
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(`Execution timed out after ${this.timeoutMs}ms`),
            ),
          this.timeoutMs,
        );
      });
      const result = await Promise.race([fn(...values), timeoutPromise]);
      return { result, logs };
    } catch (err) {
      return {
        result: undefined,
        error: err instanceof Error ? err.message : String(err),
        logs,
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

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

// Output shape returned by every docs tool. Mirroring this in the MCP outputSchema
// gives the sandbox SDK concrete TS types instead of `unknown`.
const docResultSchema = {
  path: z.string(),
  url: z.string().optional(),
  content: z.string().optional(),
  anchor: z.string().nullable().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
};

async function registerDocsTool<Args>(
  server: McpServer,
  metadata: { name: string; description: string },
  inputSchema: Record<string, z.ZodTypeAny>,
  handler: (args: Args) => Promise<string>,
): Promise<void> {
  server.registerTool(
    metadata.name,
    {
      description: metadata.description,
      inputSchema,
      outputSchema: docResultSchema,
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
