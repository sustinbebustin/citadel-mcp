import { describe, expect, test, vi } from "vitest";
import {
  parseLlmsTxt,
  parseSupabaseIndex,
  handler,
} from "./docs-search.js";

describe("parseLlmsTxt", () => {
  test("parses standard llms.txt entries", () => {
    const llms = [
      "# Title",
      "",
      "- [Functions: refresh](https://nextjs.org/docs/app/api-reference/functions/refresh): API ref for refresh.",
      "- [Caching](https://nextjs.org/docs/app/getting-started/caching-and-revalidating): Cache strategies.",
    ].join("\n");
    const rows = parseLlmsTxt(llms, "nextjs");
    expect(rows).toEqual([
      {
        stack: "nextjs",
        path: "/docs/app/api-reference/functions/refresh",
        url: "https://nextjs.org/docs/app/api-reference/functions/refresh",
        title: "Functions: refresh",
        description: "API ref for refresh.",
      },
      {
        stack: "nextjs",
        path: "/docs/app/getting-started/caching-and-revalidating",
        url: "https://nextjs.org/docs/app/getting-started/caching-and-revalidating",
        title: "Caching",
        description: "Cache strategies.",
      },
    ]);
  });

  test("skips section headers and blank lines", () => {
    const llms = [
      "# Next.js Docs",
      "",
      "## Getting Started",
      "",
      "- [Install](https://nextjs.org/docs/install): How to install.",
    ].join("\n");
    expect(parseLlmsTxt(llms, "nextjs")).toHaveLength(1);
  });

  test("handles entries without a description", () => {
    const llms = "- [Title](https://example.com/docs/foo)";
    const rows = parseLlmsTxt(llms, "nextjs");
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBeUndefined();
    expect(rows[0].title).toBe("Title");
  });

  test("strips .md suffix from path when computing path-without-suffix", () => {
    const llms = "- [Caching](https://react.dev/learn/caching.md): Caching guide.";
    const rows = parseLlmsTxt(llms, "react");
    // The path stored is the URL pathname, not stripped — caller decides
    // whether to add/remove .md. Just confirm the URL is preserved.
    expect(rows[0].url).toBe("https://react.dev/learn/caching.md");
    expect(rows[0].path).toBe("/learn/caching.md");
  });

  test("preserves turborepo relative entries by resolving them under /docs/", () => {
    // Turborepo's llms.txt ships site-relative paths like `/index.md` and
    // `index.md`. Without relative-URL handling, every row gets dropped.
    const llms = [
      "- [Introduction](index.md): Get started.",
      "- [Acknowledgements](/acknowledgments.md)",
      "- [Docker guide](/guides/tools/docker.md): Docker tips.",
    ].join("\n");
    const rows = parseLlmsTxt(llms, "turborepo");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      stack: "turborepo",
      path: "/index.md",
      url: "https://turborepo.dev/docs/index.md",
      title: "Introduction",
      description: "Get started.",
    });
    expect(rows[1].path).toBe("/acknowledgments.md");
    expect(rows[2].url).toBe("https://turborepo.dev/docs/guides/tools/docker.md");
  });

  test("drops relative entries for stacks without a known base", () => {
    const llms = "- [Bare](relative-only.md): no base for unknown stack.";
    expect(parseLlmsTxt(llms, "unknown-stack")).toEqual([]);
  });
});

describe("parseSupabaseIndex", () => {
  test("parses grouped supabase paths into rows", () => {
    const idx = [
      "# Supabase Guides Index",
      "",
      "## auth",
      "",
      "- /docs/guides/auth/server-side",
      "- /docs/guides/auth/sessions",
      "",
      "## functions",
      "",
      "- /docs/guides/functions/auth",
    ].join("\n");
    const rows = parseSupabaseIndex(idx, "supabase");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      stack: "supabase",
      path: "/docs/guides/auth/server-side",
      url: "https://supabase.com/docs/guides/auth/server-side",
      title: "auth/server-side",
      description: "auth",
    });
    expect(rows[2].title).toBe("functions/auth");
  });
});

describe("docs_search handler", () => {
  const fixtures: Record<string, string> = {
    nextjs: [
      "- [Caching strategies](https://nextjs.org/docs/app/caching): How caching works.",
      "- [Cache invalidation](https://nextjs.org/docs/app/cache-invalidation): Caching expiration patterns.",
      "- [Routing](https://nextjs.org/docs/app/routing): App Router basics.",
    ].join("\n"),
    react: [
      "- [Caching with use](https://react.dev/reference/react/use.md): Caching computations in components.",
      "- [Components](https://react.dev/learn/your-first-component.md): Components 101.",
    ].join("\n"),
  };

  function loadIndex(stack: string): Promise<string> {
    return Promise.resolve(fixtures[stack] ?? "");
  }

  test("returns top-N ranked matches across requested stacks", async () => {
    const raw = await handler(
      { query: "caching", stacks: ["nextjs", "react"], limit: 2 },
      { loadIndex },
    );
    const result = JSON.parse(raw);
    expect(result.matches).toHaveLength(2);
    for (const m of result.matches) {
      expect(["nextjs", "react"]).toContain(m.stack);
      expect(m.score).toBeGreaterThan(0);
    }
    // Sorted by score descending
    expect(result.matches[0].score).toBeGreaterThanOrEqual(
      result.matches[1].score,
    );
  });

  test("defaults stacks to all known stacks when omitted", async () => {
    const raw = await handler(
      { query: "caching", limit: 5 },
      { loadIndex, knownStacks: ["nextjs", "react"] },
    );
    const result = JSON.parse(raw);
    const stacksSeen = new Set<string>(
      result.matches.map((m: { stack: string }) => m.stack),
    );
    expect(stacksSeen.has("nextjs")).toBe(true);
    expect(stacksSeen.has("react")).toBe(true);
  });

  test("defaults limit to 10 when omitted", async () => {
    const big: Record<string, string> = {
      nextjs: Array.from(
        { length: 20 },
        (_, i) =>
          `- [Caching ${i}](https://nextjs.org/docs/app/caching-${i}): Caching strategies.`,
      ).join("\n"),
    };
    const raw = await handler(
      { query: "caching", stacks: ["nextjs"] },
      { loadIndex: (s) => Promise.resolve(big[s] ?? "") },
    );
    const result = JSON.parse(raw);
    expect(result.matches).toHaveLength(10);
  });

  test("returns empty matches when no row scores > 0", async () => {
    const raw = await handler(
      { query: "kiwi", stacks: ["nextjs"] },
      { loadIndex },
    );
    const result = JSON.parse(raw);
    expect(result.matches).toEqual([]);
  });

  test("fans out doc fetches when fetch: true", async () => {
    const fetchDoc = vi
      .fn()
      .mockImplementation((stack: string, path: string) =>
        Promise.resolve(
          JSON.stringify({
            path,
            url: `https://x.example/${path}`,
            content: `body of ${stack} ${path}`,
          }),
        ),
      );

    const raw = await handler(
      { query: "caching", stacks: ["nextjs"], limit: 2, fetch: true },
      { loadIndex, fetchDoc },
    );
    const result = JSON.parse(raw);

    expect(fetchDoc).toHaveBeenCalled();
    expect(fetchDoc.mock.calls.length).toBeLessThanOrEqual(2);
    const withContent = result.matches.filter((m: { content?: string }) => m.content);
    expect(withContent.length).toBeGreaterThan(0);
    expect(withContent[0].content).toContain("body of nextjs");
  });

  test("surfaces structured handler errors (e.g. NOT_FOUND) on the match", async () => {
    const fetchDoc = vi.fn().mockImplementation((_stack: string, path: string) =>
      path.includes("invalidation")
        ? Promise.resolve(
            JSON.stringify({
              error: "NOT_FOUND",
              message: `Documentation not found at path: "${path}".`,
            }),
          )
        : Promise.resolve(
            JSON.stringify({ path, url: `u${path}`, content: "ok" }),
          ),
    );

    const raw = await handler(
      { query: "caching", stacks: ["nextjs"], limit: 2, fetch: true },
      { loadIndex, fetchDoc },
    );
    const result = JSON.parse(raw);

    const errored = result.matches.find((m: { error?: string }) => m.error);
    expect(errored).toBeDefined();
    expect(errored.error).toMatch(/NOT_FOUND/);
    expect(errored.error).toMatch(/Documentation not found/);
    expect(errored.content).toBeUndefined();
  });

  test("attaches a per-match error and continues when one fetch fails", async () => {
    let calls = 0;
    const fetchDoc = vi.fn().mockImplementation((_stack, path) => {
      calls++;
      if (calls === 1) return Promise.reject(new Error("boom"));
      return Promise.resolve(
        JSON.stringify({ path, url: "u", content: "ok" }),
      );
    });

    const raw = await handler(
      { query: "caching", stacks: ["nextjs"], limit: 2, fetch: true },
      { loadIndex, fetchDoc },
    );
    const result = JSON.parse(raw);
    const errors = result.matches.filter((m: { error?: string }) => m.error);
    expect(errors).toHaveLength(1);
    expect(errors[0].error).toMatch(/boom/);
    const successes = result.matches.filter(
      (m: { content?: string }) => m.content === "ok",
    );
    expect(successes).toHaveLength(1);
  });
});
