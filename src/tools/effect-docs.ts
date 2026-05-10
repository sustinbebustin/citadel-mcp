import { z } from "zod";
import { createCachedTextResource } from "../_internal/cached-fetch.js";

export const inputSchema = {
  path: z
    .string()
    .describe(
      "Documentation path (e.g., '/docs/batching/' or '/docs/schema/introduction/'). Paths are pathnames from effect.website with the trailing slash, exactly as listed in the index. Get valid paths by calling codemode.effect_index() first.",
    ),
};

type EffectDocsArgs = {
  path: string;
};

export const metadata = {
  name: "effect_docs",
  description: `Fetch Effect (TypeScript) official documentation by path.

IMPORTANT: Call codemode.effect_index() first to get valid paths. Do NOT guess paths.

Workflow:
1. Call codemode.effect_index() to get the documentation index
2. Find the relevant path(s) in the index
3. Call codemode.effect_docs({ path }) — fan out parallel fetches with Promise.all when looking up multiple docs at once

Effect publishes a single concatenated llms-full.txt; this tool slices the requested page out of it, so all fetches share one cached download.`,
};

const loadFullDocs = createCachedTextResource({
  url: "https://effect.website/llms-full.txt",
  sourceLabel: "effect.website/llms-full.txt",
});

// Section delimiter inside llms-full.txt. Restricted to effect.website URLs so
// content lines that happen to start with "# [..." inside code blocks don't
// register as section starts.
const SECTION_HEADER =
  /^# \[([^\]]+)\]\((https:\/\/effect\.website\/[^)]+)\)\s*$/gm;

// Astro Starlight component imports leak into the rendered markdown.
const STARLIGHT_IMPORT =
  /^import\s+\{[^}]+\}\s+from\s+["']@astrojs\/starlight\/[^"']+["'];?\s*$/gm;

type Section = { start: number; end: number; pathname: string };

function indexSections(full: string): Section[] {
  const sections: Section[] = [];
  for (const m of full.matchAll(SECTION_HEADER)) {
    const start = m.index ?? 0;
    let pathname: string;
    try {
      pathname = new URL(m[2]).pathname;
    } catch {
      continue;
    }
    sections.push({ start, end: start + m[0].length, pathname });
  }
  return sections;
}

export async function handler({ path }: EffectDocsArgs): Promise<string> {
  if (!path.startsWith("/docs/")) {
    return JSON.stringify({
      error: "OUT_OF_SCOPE",
      message: `Path "${path}" is out of scope. The Citadel Effect docs tool covers /docs/** only. Call codemode.effect_index() and select a path that starts with "/docs/".`,
    });
  }

  const full = await loadFullDocs();
  const sections = indexSections(full);
  if (sections.length === 0) {
    throw new Error(
      "Failed to load Effect documentation: llms-full.txt returned no parseable sections.",
    );
  }

  // Index uses trailing slashes; tolerate either form on input.
  const wanted = path.endsWith("/") ? path : `${path}/`;
  const idx = sections.findIndex((s) => s.pathname === wanted);
  if (idx === -1) {
    return JSON.stringify({
      error: "NOT_FOUND",
      message: `Documentation not found at path: "${path}". This path may be outdated. Call codemode.effect_index() to find the current correct path.`,
    });
  }

  const sliceStart = sections[idx].end;
  const sliceEnd =
    idx + 1 < sections.length ? sections[idx + 1].start : full.length;
  const content = full
    .slice(sliceStart, sliceEnd)
    .replace(STARLIGHT_IMPORT, "")
    .trim();

  const url = `https://effect.website${wanted}`;
  return JSON.stringify({ path: wanted, url, content });
}
