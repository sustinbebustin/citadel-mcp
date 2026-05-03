import { createCachedTextResource } from "../../_internal/cached-fetch.js";

const GUIDES_PREFIX = "https://supabase.com/docs/guides/";

function parseGuidesFromSitemap(xml: string): string {
  const locRegex = /<loc>([^<]+)<\/loc>/g;
  const seen = new Set<string>();
  for (const match of xml.matchAll(locRegex)) {
    const url = match[1].trim();
    if (url.startsWith(GUIDES_PREFIX)) {
      seen.add(url);
    }
  }

  if (seen.size === 0) {
    return "Error: No /docs/guides/ URLs found in supabase.com/docs/sitemap.xml. The sitemap structure may have changed.";
  }

  const groups = new Map<string, string[]>();
  for (const url of seen) {
    const path = new URL(url).pathname;
    const segments = path
      .replace(/^\/docs\/guides\//, "")
      .split("/")
      .filter(Boolean);
    const category = segments[0] ?? "(root)";
    const list = groups.get(category) ?? [];
    list.push(path);
    groups.set(category, list);
  }

  const sortedCategories = [...groups.keys()].sort();
  const lines: string[] = [
    "# Supabase Guides Index",
    "",
    "> Source: https://supabase.com/docs/sitemap.xml (filtered to /docs/guides/**)",
    ">",
    "> Call `supabase_docs` with the path portion (e.g. `/docs/guides/functions/auth`). The tool appends `.md` and fetches the markdown source.",
    "",
  ];
  for (const category of sortedCategories) {
    lines.push(`## ${category}`);
    lines.push("");
    const paths = groups.get(category) ?? [];
    paths.sort();
    for (const path of paths) {
      lines.push(`- ${path}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export const metadata = {
  uri: "supabase-docs://guides-index",
  name: "Supabase Guides Index (from sitemap)",
  description:
    "Supabase /docs/guides/ index built from supabase.com/docs/sitemap.xml. You MUST read this resource first to find the correct path, then call supabase_docs with that path.",
  mimeType: "text/markdown",
};

export const handler = createCachedTextResource({
  url: "https://supabase.com/docs/sitemap.xml",
  sourceLabel: "supabase.com/docs/sitemap.xml",
  transform: parseGuidesFromSitemap,
});
