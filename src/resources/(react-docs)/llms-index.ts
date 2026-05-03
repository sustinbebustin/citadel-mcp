import { createCachedTextResource } from "../../_internal/cached-fetch.js";

export const metadata = {
  uri: "react-docs://llms-index",
  name: "React Documentation Index (llms.txt)",
  description:
    "React documentation index from react.dev/llms.txt. You MUST read this resource first to find the correct path, then call react_docs with that path.",
  mimeType: "text/plain",
};

export const handler = createCachedTextResource({
  url: "https://react.dev/llms.txt",
  sourceLabel: "react.dev/llms.txt",
});
