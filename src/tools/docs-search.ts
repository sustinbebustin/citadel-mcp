import { z } from "zod";
import { bm25 } from "../_internal/bm25.js";

export const inputSchema = {
  query: z
    .string()
    .describe("Free-text search query. Tokenized on whitespace and punctuation."),
  stacks: z
    .array(z.string())
    .optional()
    .describe(
      "Stacks to search (e.g. ['nextjs', 'react']). Defaults to all registered stacks.",
    ),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum matches to return. Default 10."),
  fetch: z
    .boolean()
    .optional()
    .describe(
      "When true, fan out doc fetches in parallel and attach `.content` to each match. One MCP call yields ranked results AND their full markdown.",
    ),
};

type DocsSearchArgs = {
  query: string;
  stacks?: string[];
  limit?: number;
  fetch?: boolean;
};

export type IndexRow = {
  stack: string;
  path: string;
  url: string;
  title: string;
  description?: string;
};

export const metadata = {
  name: "docs_search",
  description: `Cross-stack ranked search over the registered documentation indexes.

Use this when the agent's question spans more than one stack (e.g. "how does caching work in Next.js and React?") or when the agent doesn't know which stack the answer lives in. One call returns ranked matches across all requested stacks; pass fetch: true to also pull each match's markdown content in the same round-trip.

Workflow:
1. Call codemode.docs_search({ query: "caching", stacks: ["nextjs", "react"], limit: 5, fetch: true })
2. The result is { matches: [{ stack, path, url, title, description?, score, content? }] }
3. Use the content directly, or fan out further codemode.<stack>_docs() calls for additional pages.`,
};

const LLMS_LINE = /^- \[([^\]]+)\]\(([^)]+)\)(?::\s*(.+))?$/;

// Some llms.txt sources ship site-root-relative paths (e.g. Turborepo's
// `/index.md`, `/guides/foo.md`) instead of absolute URLs. The per-stack
// fetch handler is the source of truth for how a path resolves against
// its host; this map only exists to reconstruct a presentational `url`
// for the index row.
const STACK_RELATIVE_BASE: Record<string, string> = {
  turborepo: "https://turborepo.dev/docs",
};

export function parseLlmsTxt(text: string, stack: string): IndexRow[] {
  const rows: IndexRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("- [")) continue;
    const match = LLMS_LINE.exec(trimmed);
    if (!match) continue;
    const [, title, rawUrl, description] = match;
    let path: string;
    let url: string;
    try {
      const u = new URL(rawUrl);
      path = u.pathname;
      url = rawUrl;
    } catch {
      const base = STACK_RELATIVE_BASE[stack];
      if (!base || !rawUrl || rawUrl.includes("://")) continue;
      path = rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`;
      url = `${base}${path}`;
    }
    rows.push({
      stack,
      path,
      url,
      title,
      ...(description ? { description } : {}),
    });
  }
  return rows;
}

const SUPABASE_BASE = "https://supabase.com";
const SUPABASE_GUIDES_PREFIX = "/docs/guides/";

export function parseSupabaseIndex(text: string, stack: string): IndexRow[] {
  const rows: IndexRow[] = [];
  let category = "";
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) {
      category = trimmed.slice(3).trim();
      continue;
    }
    if (!trimmed.startsWith("- /docs/guides/")) continue;
    const path = trimmed.slice(2).trim();
    const title = path.startsWith(SUPABASE_GUIDES_PREFIX)
      ? path.slice(SUPABASE_GUIDES_PREFIX.length)
      : path;
    rows.push({
      stack,
      path,
      url: `${SUPABASE_BASE}${path}`,
      title,
      ...(category ? { description: category } : {}),
    });
  }
  return rows;
}

function parseIndexForStack(stack: string, text: string): IndexRow[] {
  if (stack === "supabase") return parseSupabaseIndex(text, stack);
  return parseLlmsTxt(text, stack);
}

export type DocsSearchDeps = {
  loadIndex: (stack: string) => Promise<string>;
  fetchDoc?: (stack: string, path: string) => Promise<string>;
  knownStacks?: string[];
};

const DEFAULT_LIMIT = 10;

type Match = IndexRow & { score: number; content?: string; error?: string };

export async function handler(
  args: DocsSearchArgs,
  deps: DocsSearchDeps,
): Promise<string> {
  const stacks =
    args.stacks && args.stacks.length > 0
      ? args.stacks
      : (deps.knownStacks ?? []);
  const limit = args.limit ?? DEFAULT_LIMIT;

  const indexes = await Promise.all(
    stacks.map(async (stack) => {
      const text = await deps.loadIndex(stack);
      return parseIndexForStack(stack, text);
    }),
  );
  const allRows = indexes.flat();

  const corpus = allRows.map(
    (r) => `${r.title} ${r.description ?? ""}`.trim(),
  );
  const scores = bm25(corpus, args.query);

  const ranked: Match[] = allRows
    .map((row, i) => ({ ...row, score: scores[i] ?? 0 }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (args.fetch && deps.fetchDoc && ranked.length > 0) {
    const fetcher = deps.fetchDoc;
    const fetched = await Promise.all(
      ranked.map(async (m): Promise<Match> => {
        try {
          const raw = await fetcher(m.stack, m.path);
          const parsed = JSON.parse(raw) as {
            content?: string;
            error?: string;
            message?: string;
          };
          if (parsed.content) return { ...m, content: parsed.content };
          if (parsed.error) {
            return {
              ...m,
              error: parsed.message
                ? `${parsed.error}: ${parsed.message}`
                : parsed.error,
            };
          }
          return m;
        } catch (err) {
          return {
            ...m,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );
    return JSON.stringify({ matches: fetched });
  }

  return JSON.stringify({ matches: ranked });
}
