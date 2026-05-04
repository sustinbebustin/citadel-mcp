import { describe, expect, test } from "vitest";
import { NodeVMExecutor } from "./executor.js";

describe("NodeVMExecutor", () => {
  test("returns the result of an async arrow function", async () => {
    const e = new NodeVMExecutor();
    const r = await e.execute("async () => 42", []);
    expect(r.result).toBe(42);
    expect(r.error).toBeUndefined();
  });

  test("captures console.log into logs without writing to stdout", async () => {
    const e = new NodeVMExecutor();
    const r = await e.execute(
      "async () => { console.log('hi'); return 42; }",
      [],
    );
    expect(r.result).toBe(42);
    expect(r.logs).toEqual(["hi"]);
  });

  test("tags console.error and console.warn distinctly", async () => {
    const e = new NodeVMExecutor();
    const r = await e.execute(
      "async () => { console.error('boom'); console.warn('careful'); return null; }",
      [],
    );
    expect(r.logs).toEqual(["[err] boom", "[warn] careful"]);
  });

  test("rejects async-no-resolve runaway code with a timeout error", async () => {
    const e = new NodeVMExecutor(100);
    const r = await e.execute("async () => { await new Promise(() => {}); }", []);
    expect(r.error).toMatch(/timed out/i);
    expect(r.error).toMatch(/100ms/);
  });

  test("returns error string when sandbox code throws", async () => {
    const e = new NodeVMExecutor();
    const r = await e.execute("async () => { throw new Error('nope'); }", []);
    expect(r.error).toBe("nope");
    expect(r.result).toBeUndefined();
  });

  test("preserves logs when sandbox code throws", async () => {
    const e = new NodeVMExecutor();
    const r = await e.execute(
      "async () => { console.log('before'); throw new Error('nope'); }",
      [],
    );
    expect(r.error).toBe("nope");
    expect(r.logs).toEqual(["before"]);
  });

  test("sandbox sees parsed JSON, not the MCP CallToolResult envelope", async () => {
    const e = new NodeVMExecutor();
    const provider = {
      name: "codemode",
      fns: {
        getThing: async () => ({
          content: [{ type: "text", text: '{"x":1}' }],
        }),
      },
    };
    const r = await e.execute(
      "async () => (await codemode.getThing()).x",
      [provider],
    );
    expect(r.result).toBe(1);
    expect(r.error).toBeUndefined();
  });

  test("sandbox try/catch fires when MCP tool returns isError: true", async () => {
    const e = new NodeVMExecutor();
    const provider = {
      name: "codemode",
      fns: {
        boom: async () => ({
          content: [{ type: "text", text: "tool failure detail" }],
          isError: true,
        }),
      },
    };
    const r = await e.execute(
      "async () => { try { await codemode.boom(); return 'no-throw'; } catch (e) { return e.message; } }",
      [provider],
    );
    expect(r.result).toBe("tool failure detail");
  });

  test("supports the multi-provider array form", async () => {
    const e = new NodeVMExecutor();
    const r = await e.execute(
      "async () => alpha.greet('world')",
      [
        {
          name: "alpha",
          fns: {
            greet: async (...args: unknown[]) => ({
              content: [{ type: "text", text: `hi ${String(args[0])}` }],
            }),
          },
        },
      ],
    );
    expect(r.result).toBe("hi world");
  });
});
