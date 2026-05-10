import { createCachedTextResource } from "../../_internal/cached-fetch.js";

export const metadata = {
  uri: "oxc-docs://llms-index",
  name: "Oxc Documentation Index (llms.txt)",
  description:
    "Oxc (Oxlint + Oxfmt) documentation index from oxc.rs/llms.txt. The agent calls codemode.oxc_index() first to find the correct path, then calls codemode.oxc_docs({ path }).",
  mimeType: "text/plain",
};

export const handler = createCachedTextResource({
  url: "https://oxc.rs/llms.txt",
  sourceLabel: "oxc.rs/llms.txt",
});
