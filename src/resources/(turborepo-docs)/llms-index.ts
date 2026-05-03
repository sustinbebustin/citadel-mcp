import { createCachedTextResource } from "../../_internal/cached-fetch.js";

export const metadata = {
  uri: "turborepo-docs://llms-index",
  name: "Turborepo Documentation Index (llms.txt)",
  description:
    "Turborepo documentation index from turborepo.dev/llms.txt. You MUST read this resource first to find the correct path, then call turborepo_docs with that path.",
  mimeType: "text/plain",
};

export const handler = createCachedTextResource({
  url: "https://turborepo.dev/llms.txt",
  sourceLabel: "turborepo.dev/llms.txt",
});
