// Shared helpers for the TanStack docs stacks (start, router, query).
//
// All three libraries share one sitemap (tanstack.com/sitemap.xml) and the
// same per-page markdown convention (`<page-url>.md` returns text/markdown).
// Each library's index is built by filtering the sitemap to its `pathPrefix`
// and synthesizing an llms.txt-style listing so `parseLlmsTxt` in
// docs-search.ts can rank it directly.

import { z } from "zod";
import { createCachedTextResource } from "./cached-fetch.js";
import { stripDocChrome } from "./strip-doc-chrome.js";

const SITEMAP_URL = "https://tanstack.com/sitemap.xml";

export type TanstackLib = {
  /** url-safe id used in tool names: tanstack_<slug>_docs */
  slug: "start" | "router" | "query";
  /** human label used in copy: "TanStack Start" */
  label: string;
  /** path prefix that scopes valid pages, e.g. "/start/latest/docs/" */
  pathPrefix: string;
};

function titleCase(segment: string): string {
  return segment
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildIndex(xml: string, lib: TanstackLib): string {
  const matchPrefix = `https://tanstack.com${lib.pathPrefix}`;
  const seen = new Set<string>();
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const url = m[1].trim();
    if (url.startsWith(matchPrefix)) seen.add(url);
  }
  if (seen.size === 0) {
    return `Error: No ${lib.pathPrefix}** URLs found in ${SITEMAP_URL}. The sitemap structure may have changed.`;
  }

  type Entry = { url: string; title: string; group: string };
  const entries: Entry[] = [];
  for (const url of seen) {
    const path = new URL(url).pathname;
    const after = path.slice(lib.pathPrefix.length);
    const segments = after.split("/").filter(Boolean);
    if (segments.length === 0) continue; // skip the bare /docs/ root
    const last = segments[segments.length - 1];
    const parents = segments.slice(0, -1);
    entries.push({
      url,
      title: titleCase(last),
      group: parents.length > 0 ? parents.join(" / ") : "(root)",
    });
  }
  entries.sort(
    (a, b) => a.group.localeCompare(b.group) || a.title.localeCompare(b.title),
  );

  const lines: string[] = [
    `# ${lib.label} Documentation Index`,
    "",
    `> Source: ${SITEMAP_URL} (filtered to ${lib.pathPrefix}**)`,
    ">",
    `> Call \`tanstack_${lib.slug}_docs\` with the path portion (e.g. \`${lib.pathPrefix}framework/react/overview\`). The tool appends \`.md\` and fetches the markdown source.`,
    "",
    "## Docs",
    "",
  ];
  for (const e of entries) {
    lines.push(`- [${e.title}](${e.url}): ${e.group}`);
  }
  return lines.join("\n");
}

export function createTanstackIndexHandler(
  lib: TanstackLib,
): () => Promise<string> {
  return createCachedTextResource({
    url: SITEMAP_URL,
    sourceLabel: `tanstack.com/sitemap.xml (${lib.slug})`,
    transform: (xml) => buildIndex(xml, lib),
  });
}

export const tanstackDocsInputSchema = {
  path: z
    .string()
    .describe(
      "Documentation path from the index (e.g., '/start/latest/docs/framework/react/overview'). Do NOT include a '.md' suffix — the tool appends it. Get valid paths by calling the matching codemode.tanstack_<lib>_index() first.",
    ),
};

export type TanstackDocsArgs = { path: string };

export function createTanstackDocsHandler(
  lib: TanstackLib,
): (args: TanstackDocsArgs) => Promise<string> {
  return async function handler({ path }) {
    if (!path.startsWith(lib.pathPrefix)) {
      return JSON.stringify({
        error: "OUT_OF_SCOPE",
        message: `Path "${path}" is out of scope. The Citadel ${lib.label} docs tool covers ${lib.pathPrefix}** only. Call codemode.tanstack_${lib.slug}_index() and select a path that starts with "${lib.pathPrefix}".`,
      });
    }
    const cleaned = path
      .replace(/[#?].*$/, "")
      .replace(/\/+$/, "")
      .replace(/\.md$/, "");
    const url = `https://tanstack.com${cleaned}.md`;
    const response = await fetch(url, {
      headers: { Accept: "text/markdown" },
    });
    if (!response.ok) {
      if (response.status === 404) {
        return JSON.stringify({
          error: "NOT_FOUND",
          message: `Documentation not found at path: "${path}". This path may be outdated. Call codemode.tanstack_${lib.slug}_index() to find the current correct path.`,
        });
      }
      throw new Error(
        `Failed to fetch documentation: ${response.status} ${response.statusText}`,
      );
    }
    const body = await response.text();
    // TanStack returns 200 with `{"isNotFound":true}` for missing pages
    // instead of a 404. The Accept: text/markdown header doesn't change this.
    if (body.trim() === '{"isNotFound":true}') {
      return JSON.stringify({
        error: "NOT_FOUND",
        message: `Documentation not found at path: "${path}". This path may be outdated. Call codemode.tanstack_${lib.slug}_index() to find the current correct path.`,
      });
    }
    const markdown = stripDocChrome(body);
    return JSON.stringify({ path: cleaned, url, content: markdown });
  };
}

export function buildDocsToolMetadata(lib: TanstackLib): {
  name: string;
  description: string;
} {
  const toolName = `tanstack_${lib.slug}_docs`;
  const indexName = `tanstack_${lib.slug}_index`;
  return {
    name: toolName,
    description: `Fetch ${lib.label} official documentation by path.

IMPORTANT: Call codemode.${indexName}() first to get valid paths. Do NOT guess paths.

Workflow:
1. Call codemode.${indexName}() to get the documentation index
2. Find the relevant path(s) in the index
3. Call codemode.${toolName}({ path }) — fan out parallel fetches with Promise.all when looking up multiple docs at once`,
  };
}

export function buildIndexMetadata(lib: TanstackLib): {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
} {
  return {
    uri: `tanstack-${lib.slug}-docs://sitemap-index`,
    name: `${lib.label} Documentation Index (from sitemap)`,
    description: `${lib.label} documentation index, built from tanstack.com/sitemap.xml filtered to ${lib.pathPrefix}**. The agent calls codemode.tanstack_${lib.slug}_index() first to find the correct path, then calls codemode.tanstack_${lib.slug}_docs({ path }).`,
    mimeType: "text/markdown",
  };
}

export const TANSTACK_LIBS = {
  start: {
    slug: "start",
    label: "TanStack Start",
    pathPrefix: "/start/latest/docs/",
  },
  router: {
    slug: "router",
    label: "TanStack Router",
    pathPrefix: "/router/latest/docs/",
  },
  query: {
    slug: "query",
    label: "TanStack Query",
    pathPrefix: "/query/latest/docs/",
  },
} as const satisfies Record<string, TanstackLib>;
