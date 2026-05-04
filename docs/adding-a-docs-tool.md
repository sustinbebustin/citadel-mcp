# Adding a docs tool

This guide walks through packaging a new stack — call it `<stack>` — as a Citadel docs tool. When you're done, the agent will be able to call `codemode.<stack>_index()` and `codemode.<stack>_docs({ path })` from inside the `code` sandbox.

A docs tool is two small modules plus three lines of registration. The existing stacks in `src/tools/` and `src/resources/` are the canonical reference — copy whichever one is closest to your source's shape.

## Prerequisites

Pick an upstream that exposes machine-readable markdown. The good shapes are:

- An `llms.txt` index (Next.js, React, Turborepo all do this).
- A sitemap you can filter to the docs subtree (Supabase).
- A static set of paths you maintain inline if the upstream has neither.

If your upstream only ships HTML, you'll need to convert it to markdown yourself before serving it. The point of Citadel is to give the agent clean markdown, not raw pages.

## 1. Add the index resource

Create `src/resources/(<stack>-docs)/llms-index.ts` (or `guides-index.ts`, etc. — name it after what it indexes). Use `createCachedTextResource` from `src/_internal/cached-fetch.ts`. It handles 1-hour in-memory caching and stale-on-failure fallback.

The simplest case (raw `llms.txt`):

```ts
import { createCachedTextResource } from "../../_internal/cached-fetch.js";

export const metadata = {
  uri: "<stack>-docs://llms-index",
  name: "<Stack> Documentation Index",
  description:
    "<Stack> documentation index. The agent calls codemode.<stack>_index() first to find the correct path, then calls codemode.<stack>_docs({ path }).",
  mimeType: "text/plain",
};

export const handler = createCachedTextResource({
  url: "https://<stack>.example.com/llms.txt",
  sourceLabel: "<stack>.example.com/llms.txt",
});
```

If the upstream needs post-processing (e.g. parsing a sitemap into a grouped index), pass a `transform`:

```ts
export const handler = createCachedTextResource({
  url: "https://<stack>.example.com/sitemap.xml",
  sourceLabel: "<stack>.example.com/sitemap.xml",
  transform: parseGuidesFromSitemap,
});
```

See `src/resources/(supabase-docs)/guides-index.ts` for a working sitemap transform.

The `uri` in `metadata` is retained for clarity; it is no longer routed via MCP resources. Citadel exposes index resources as no-arg tools (`<stack>_index`) so they're reachable from inside the `code` sandbox.

## 2. Add the fetch tool

Create `src/tools/<stack>-docs.ts`. The tool takes a `path` from the index, fetches the upstream markdown, strips vendor chrome, and returns a JSON-stringified `{ path, url, content }`.

```ts
import { z } from "zod";
import { stripDocChrome } from "../_internal/strip-doc-chrome.js";

export const inputSchema = {
  path: z
    .string()
    .describe(
      "Documentation path (e.g., '/docs/...'). Get valid paths by calling codemode.<stack>_index() first.",
    ),
};

type StackDocsArgs = { path: string };

export const metadata = {
  name: "<stack>_docs",
  description: `Fetch <Stack> documentation by path.

IMPORTANT: Call codemode.<stack>_index() first to get valid paths. Do NOT guess paths.

Workflow:
1. Call codemode.<stack>_index() to get the documentation index
2. Find the relevant path(s) in the index
3. Call codemode.<stack>_docs({ path }) — fan out parallel fetches with Promise.all when looking up multiple docs at once`,
};

export async function handler({ path }: StackDocsArgs): Promise<string> {
  // Validate scope. Reject paths the tool isn't meant to serve so the
  // agent gets a clear error and re-reads the index.
  if (!path.startsWith("/docs/")) {
    return JSON.stringify({
      error: "OUT_OF_SCOPE",
      message: `Path "${path}" is out of scope. Call codemode.<stack>_index() for valid paths.`,
    });
  }

  const url = `https://<stack>.example.com${path}`;
  const response = await fetch(url, { headers: { Accept: "text/markdown" } });

  if (!response.ok) {
    if (response.status === 404) {
      return JSON.stringify({
        error: "NOT_FOUND",
        message: `Documentation not found at path: "${path}". The path may be outdated — call codemode.<stack>_index() to refresh it.`,
      });
    }
    throw new Error(
      `Failed to fetch documentation: ${response.status} ${response.statusText}`,
    );
  }

  const markdown = stripDocChrome(await response.text());
  return JSON.stringify({ path, url, content: markdown });
}
```

A few conventions to follow:

- Always return `JSON.stringify(...)`. The Code Mode wrapper parses the text and surfaces it as `structuredContent` typed by `docResultSchema` in `src/index.ts`.
- Validate the path's prefix and return a structured `error` object instead of throwing. The agent can read the message and recover.
- Run the markdown through `stripDocChrome` from `src/_internal/strip-doc-chrome.ts` to remove frontmatter and footers. Add new patterns there if your upstream has its own chrome.
- Mirror an existing tool. `nextjs-docs.ts` is the simplest; `supabase-docs.ts` shows path normalization (auto-appending `.md`).

## 3. Register both in `src/index.ts`

Open `src/index.ts` and add three things:

a) Imports near the top, alongside the existing tool/resource imports:

```ts
import * as <stack>Docs from "./tools/<stack>-docs.js";
import * as <stack>DocsIndex from "./resources/(<stack>-docs)/llms-index.js";
```

b) Inside `createUpstream()`, add the docs tool registration with the others:

```ts
await registerDocsTool(
  server,
  <stack>Docs.metadata,
  <stack>Docs.inputSchema,
  <stack>Docs.handler,
);
```

c) And the index tool registration:

```ts
registerIndexTool(
  server,
  "<stack>_index",
  "<Stack>",
  "<stack>_docs",
  <stack>DocsIndex,
);
```

Both names appear automatically in the typed sandbox SDK that ships in the `code` tool description, so the agent will see them on the next session.

## 4. Verify

```bash
pnpm typecheck
pnpm build
```

If you've already registered Citadel with Claude Code, restart it so it picks up the new tools, then ask the agent to call `<stack>_index()` to confirm the index loads.

## Reference files

- `src/tools/nextjs-docs.ts` — minimal docs tool (raw markdown fetch).
- `src/tools/supabase-docs.ts` — docs tool with path normalization.
- `src/resources/(nextjs-docs)/llms-index.ts` — minimal index resource.
- `src/resources/(supabase-docs)/guides-index.ts` — index built from a sitemap with a transform.
- `src/_internal/cached-fetch.ts` — the `createCachedTextResource` helper.
- `src/_internal/strip-doc-chrome.ts` — vendor frontmatter/footer stripper.
- `src/index.ts` — `registerDocsTool` and `registerIndexTool`, plus the Code Mode wrapping logic.
