import { describe, expect, test } from "vitest";
import {
  buildCodeExample,
  generateCodemodeTypes,
} from "./generate-codemode-types.js";

describe("generateCodemodeTypes", () => {
  test("emits zero-arg signature when inputSchema has no properties", () => {
    const out = generateCodemodeTypes([
      {
        name: "nextjs_index",
        description: "",
        inputSchema: { type: "object", properties: {} },
      },
    ]);
    expect(out).toMatch(/nextjs_index:\s*\(\)\s*=>/);
    expect(out).not.toMatch(/Record<string,\s*never>/);
  });

  test("emits Promise<string> for *_index tools without outputSchema", () => {
    const out = generateCodemodeTypes([
      {
        name: "react_index",
        description: "",
        inputSchema: { type: "object", properties: {} },
      },
    ]);
    expect(out).toMatch(/type ReactIndexOutput = string;/);
    expect(out).toMatch(
      /react_index:\s*\(\)\s*=>\s*Promise<ReactIndexOutput>/,
    );
    expect(out).not.toMatch(/Promise<unknown>/);
  });

  test("emits typed input + structured output for docs tools", () => {
    const out = generateCodemodeTypes([
      {
        name: "nextjs_docs",
        description: "Fetch a doc",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
        outputSchema: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" },
          },
        },
      },
    ]);
    expect(out).toMatch(/type NextjsDocsInput = \{[\s\S]*path: string;[\s\S]*\};/);
    expect(out).toMatch(/type NextjsDocsOutput = \{[\s\S]*content\?: string;[\s\S]*\};/);
    expect(out).toMatch(/nextjs_docs:\s*\(input: NextjsDocsInput\)\s*=>\s*Promise<NextjsDocsOutput>/);
  });

  test("includes the codemode JSDoc header explaining the SDK is callable", () => {
    const out = generateCodemodeTypes([
      {
        name: "nextjs_index",
        inputSchema: { type: "object", properties: {} },
      },
    ]);
    expect(out).toMatch(/Sandbox SDK\./);
    expect(out).toMatch(/Promise\.all/);
    expect(out).toMatch(/declare const codemode:/);
  });
});

describe("buildCodeExample", () => {
  test("emits a no-arg example for tools with no input properties", () => {
    const out = buildCodeExample([
      {
        name: "nextjs_index",
        inputSchema: { type: "object", properties: {} },
      },
    ]);
    expect(out).toMatch(/codemode\.nextjs_index\(\)/);
  });

  test("emits an args example for tools with input properties", () => {
    const out = buildCodeExample([
      {
        name: "nextjs_docs",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string" } },
        },
      },
    ]);
    expect(out).toMatch(/codemode\.nextjs_docs\(\{ path: "\.\.\." \}\)/);
  });

  test("emits Promise.all fan-out when multiple _index tools exist", () => {
    const out = buildCodeExample([
      {
        name: "nextjs_index",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "react_index",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "nextjs_docs",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string" } },
        },
      },
    ]);
    expect(out).toMatch(/Promise\.all/);
    expect(out).toMatch(/codemode\.nextjs_index\(\)/);
    expect(out).toMatch(/codemode\.react_index\(\)/);
  });
});
