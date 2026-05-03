import { createCachedTextResource } from "../../_internal/cached-fetch.js";

export const metadata = {
  uri: "nextjs-docs://llms-index",
  name: "Next.js Documentation Index (App Router, Next.js 16)",
  description:
    "Next.js documentation index from nextjs.org/docs/llms.txt. Covers App Router only on Next.js 16. You MUST read this resource first to find the correct path, then call nextjs_docs with that path. Pages Router paths are not supported.",
  mimeType: "text/plain",
};

export const handler = createCachedTextResource({
  url: "https://nextjs.org/docs/llms.txt",
  sourceLabel: "nextjs.org/docs/llms.txt",
});
