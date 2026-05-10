// Local Node executor for the codemode `docs` tool.
//
// Two load-bearing guards when editing this file:
//   1. Sandbox `console` is shadowed via an AsyncFunction parameter so
//      LLM-generated console.log/error/warn never reach process.stdout
//      (owned by StdioServerTransport). Captured output is returned in
//      ExecuteResult.logs and surfaced as a [logs] block to the agent.
//   2. Promise.race against a setTimeout bounds runaway async code.
//      Synchronous infinite loops are NOT bounded — that requires node:vm.
//      The trust model is single-user + Claude Code; the loop can be
//      interrupted by exiting the host.
//
// `wrapProviderFns` unwraps MCP CallToolResult shapes so sandbox code
// sees parsed JSON and try/catch fires on tool errors.
import type { Executor, ExecuteResult } from "@cloudflare/codemode";

export const AsyncFunction: new (...args: string[]) => (
  ...args: unknown[]
) => Promise<unknown> = Object.getPrototypeOf(async function () {}).constructor;

export type ProviderFn = (...args: unknown[]) => Promise<unknown>;

export type ResolvedProvider = {
  name: string;
  fns: Record<string, ProviderFn>;
  positionalArgs?: boolean;
};

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

export function wrapProviderFns(
  fns: Record<string, ProviderFn>,
): Record<string, ProviderFn> {
  const wrapped: Record<string, ProviderFn> = {};
  for (const [key, fn] of Object.entries(fns)) {
    wrapped[key] = async (...args) => unwrapMcpResult(await fn(...args));
  }
  return wrapped;
}

export class NodeVMExecutor implements Executor {
  constructor(private readonly timeoutMs: number = 30_000) {}

  async execute(
    code: string,
    providersOrFns: ResolvedProvider[] | Record<string, ProviderFn>,
  ): Promise<ExecuteResult> {
    const logs: string[] = [];
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
            reject(new Error(`Execution timed out after ${this.timeoutMs}ms`)),
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
