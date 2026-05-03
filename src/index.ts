#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
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

const tools = [nextjsDocs, reactDocs, turborepoDocs, supabaseDocs];

const resources = [
  nextjsDocsLlmsIndex,
  reactDocsLlmsIndex,
  turborepoDocsLlmsIndex,
  supabaseDocsGuidesIndex,
];

// Type definitions
interface JSONSchema {
  type?: string;
  description?: string;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  enum?: unknown[];
}

// Create server
const server = new Server(
  {
    name: "citadel-mcp",
    version: pkg.version,
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  },
);

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.map((tool) => ({
      name: tool.metadata.name,
      description: tool.metadata.description,
      inputSchema: {
        type: "object",
        properties: Object.entries(tool.inputSchema).reduce(
          (acc, [key, zodSchema]) => {
            acc[key] = zodSchemaToJsonSchema(zodSchema);
            return acc;
          },
          {} as Record<string, JSONSchema>,
        ),
      },
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const tool = tools.find((t) => t.metadata.name === name);
  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }

  const parsedArgs = parseToolArgs(tool.inputSchema, args || {});

  const result = await (
    tool.handler as (args: Record<string, unknown>) => Promise<string>
  )(parsedArgs);

  return {
    content: [
      {
        type: "text",
        text: result,
      },
    ],
  };
});

// Register resource handlers
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: resources.map((resource) => ({
      uri: resource.metadata.uri,
      name: resource.metadata.name,
      description: resource.metadata.description,
      mimeType: resource.metadata.mimeType || "text/markdown",
    })),
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  const resource = resources.find((r) => r.metadata.uri === uri);
  if (!resource) {
    throw new Error(`Resource not found: ${uri}`);
  }

  const content = await resource.handler();

  return {
    contents: [
      {
        uri,
        mimeType: resource.metadata.mimeType || "text/markdown",
        text: content,
      },
    ],
  };
});

function zodSchemaToJsonSchema(zodSchema: z.ZodTypeAny): JSONSchema {
  const description = zodSchema._def?.description;

  if (zodSchema._def?.typeName === "ZodString") {
    return { type: "string", description };
  }
  if (zodSchema._def?.typeName === "ZodNumber") {
    return { type: "number", description };
  }
  if (zodSchema._def?.typeName === "ZodBoolean") {
    return { type: "boolean", description };
  }
  if (zodSchema._def?.typeName === "ZodArray") {
    return {
      type: "array",
      description,
      items: zodSchemaToJsonSchema(zodSchema._def.type),
    };
  }
  if (zodSchema._def?.typeName === "ZodObject") {
    const shape = zodSchema._def.shape();
    const properties: Record<string, JSONSchema> = {};
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodSchemaToJsonSchema(value as z.ZodTypeAny);
    }
    return { type: "object", description, properties };
  }
  if (zodSchema._def?.typeName === "ZodEnum") {
    return { type: "string", enum: zodSchema._def.values, description };
  }
  if (zodSchema._def?.typeName === "ZodOptional") {
    return zodSchemaToJsonSchema(zodSchema._def.innerType);
  }
  if (zodSchema._def?.typeName === "ZodUnion") {
    const options = zodSchema._def.options;
    if (options.length === 2) {
      return zodSchemaToJsonSchema(options[0]);
    }
  }

  return { type: "string", description };
}

function parseToolArgs(
  schema: Record<string, z.ZodTypeAny>,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, zodSchema] of Object.entries(schema)) {
    if (args[key] !== undefined) {
      const parsed = zodSchema.safeParse(args[key]);
      if (parsed.success) {
        result[key] = parsed.data;
      } else {
        throw new Error(`Invalid argument '${key}': ${parsed.error.message}`);
      }
    } else if (!zodSchema.isOptional()) {
      throw new Error(`Missing required argument: ${key}`);
    }
  }

  return result;
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = () => {
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
