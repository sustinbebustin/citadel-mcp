import { createCachedTextResource } from "../../_internal/cached-fetch.js";

export const metadata = {
  uri: "effect-docs://llms-index",
  name: "Effect Documentation Index (llms.txt)",
  description:
    "Effect (TypeScript) documentation index from effect.website/llms.txt. The agent calls codemode.effect_index() first to find the correct path, then calls codemode.effect_docs({ path }).",
  mimeType: "text/plain",
};

export const handler = createCachedTextResource({
  url: "https://effect.website/llms.txt",
  sourceLabel: "effect.website/llms.txt",
});
