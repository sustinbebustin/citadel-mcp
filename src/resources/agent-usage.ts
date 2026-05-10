export const metadata = {
  uri: "citadel://docs/agent-usage",
  name: "agent-usage",
  title: "Citadel Agent Usage Guide",
  description:
    "Full playbook for writing `docs` calls against the Citadel codemode SDK: workflow, parallel fan-out patterns, error handling, common mistakes. Read once before your first `docs` call.",
  mimeType: "text/markdown",
} as const;

const AGENT_USAGE_MD = `# Using Citadel as an AI Agent

You have access to one MCP tool, \`docs\`. Its description embeds a TypeScript SDK named \`codemode\` covering every doc source Citadel ships. To fetch documentation, you write **one** async arrow function per turn that calls the SDK; the server runs it in a local Node sandbox and returns the result. N doc fetches collapse into one round-trip.

This guide is a playbook. Read it before your first call.

## Mental model

- The \`docs\` tool takes a string of JavaScript and returns whatever your function returns.
- Inside the sandbox, \`codemode.<name>(args)\` calls the upstream tool by name. It already returns parsed JSON — you do not unwrap MCP envelopes.
- A \`*_index()\` call returns the raw markdown index for a stack. A \`*_docs({ path })\` call returns \`{ path, url, content }\` for that specific doc.
- You discover paths by reading the index. **Never guess paths** — they fail with 404 and waste a round-trip.

## Anatomy of a call

The \`code\` argument to the \`docs\` tool is a single async arrow function as a string. The outer wrapping (\`(async () => { ... })()\`) is added for you, so write the function literal directly:

\`\`\`js
async () => {
  const index = await codemode.nextjs_index();
  return index.slice(0, 200);
}
\`\`\`

Whatever you \`return\` is JSON-stringified and shown back to you. If your function throws, the response includes \`Error: <message>\` and the call is marked as an error. Anything you \`console.log\` / \`console.error\` / \`console.warn\` is captured and shown as a separate \`[logs]\` block — useful for debugging without polluting your return value.

Hard rules for the function itself:
- Plain JavaScript only. No TypeScript syntax, no \`import\`, no \`require\`.
- One arrow function. Don't define named helpers and call them — just inline the logic.
- The function must \`return\` something. \`return undefined\` is fine; missing \`return\` shows \`undefined\`.

## Sandbox SDK

The exact input/output types live in the \`docs\` tool description; treat the list below as orientation.

**Cross-stack search** — the one-call shortcut:
- \`codemode.docs_search({ query, stacks?, limit?, fetch? })\` — BM25 ranked search across registered indexes. With \`fetch: true\` the server fans out doc fetches in parallel and attaches \`.content\` to each match. One MCP call yields ranked results with full markdown.

**Per-stack tools** — when you already know the stack and want raw access:

| Stack | Index call | Docs call | Notes |
|---|---|---|---|
| Next.js | \`codemode.nextjs_index()\` | \`codemode.nextjs_docs({ path, anchor? })\` | App Router, Next.js 16 only. Pages Router paths (\`/docs/pages/...\`) are rejected. Do not include \`.md\` — the tool appends it. |
| React | \`codemode.react_index()\` | \`codemode.react_docs({ path })\` | Paths include the \`.md\` suffix as listed in the index. |
| Turborepo | \`codemode.turborepo_index()\` | \`codemode.turborepo_docs({ path })\` | Paths are relative to \`/docs/\` (e.g., \`/reference/run.md\`). |
| Supabase | \`codemode.supabase_index()\` | \`codemode.supabase_docs({ path })\` | Scoped to \`/docs/guides/**\` only. Do not include \`.md\` — the tool appends it. |

Every \`*_docs(...)\` call returns the same shape:

\`\`\`ts
{
  path: string;
  url?: string;
  content?: string;     // markdown, vendor chrome already stripped
  anchor?: string | null;
  error?: string;       // present on NOT_FOUND, OUT_OF_SCOPE, PAGES_ROUTER_NOT_SUPPORTED
  message?: string;     // human-readable detail when \`error\` is set
}
\`\`\`

If \`error\` is set, \`content\` is missing — branch on \`r.error\` before reading \`r.content\`. The tool throws (and your \`try/catch\` fires) only on hard transport failures like a 500 or network error, not on 404 / scope violations — those come back as structured errors so you can recover programmatically.

## The standard workflow

1. Call the relevant \`*_index()\` to get the markdown index.
2. Scan the index for the topic you need. Match against substrings of paths or section headings — these indices are flat lists of links, not searchable databases. \`index.split("\\n").filter(line => line.includes("server actions"))\` is the standard move.
3. Call the relevant \`*_docs({ path })\` with the exact path from the index.
4. Return the data you need. Don't return more than the user actually needs — see "Return only what's needed" below.

## Patterns

### Cross-stack search — the one-call shortcut

When the question spans more than one stack ("how does caching work in Next.js and React?"), or when you don't know which stack has the answer, \`docs_search\` collapses the whole workflow into one MCP call.

\`\`\`js
async () => {
  const r = await codemode.docs_search({
    query: "caching",
    stacks: ["nextjs", "react"], // omit to search every registered stack
    limit: 5,
    fetch: true,                 // server fans out parallel doc fetches
  });
  // r.matches: [{ stack, path, url, title, description?, score, content?, error? }]
  return r.matches.map((m) => ({
    stack: m.stack,
    title: m.title,
    head: m.content?.slice(0, 400),
  }));
}
\`\`\`

When \`fetch: false\` (or omitted), you get ranked paths only — useful when you want to inspect the index hits before deciding what to fetch. The handler degrades gracefully if any individual fetch fails: that match comes back with an \`error\` field instead of \`content\`.

Reach for \`docs_search\` first; fall back to direct \`*_index()\` + \`*_docs()\` only when you need bespoke filtering the BM25 ranker can't express (e.g. "all paths under \`/docs/app/api-reference/functions/\`").

### Parallel fan-out — the entire reason this tool exists

When you need multiple docs, fetch them concurrently with \`Promise.all\`. A single sandbox turn handles arbitrarily many fetches, and Citadel runs them in parallel. Sequential \`await\`s waste real time and defeat the point of Code Mode.

\`\`\`js
async () => {
  const index = await codemode.nextjs_index();
  const wanted = [
    "/docs/app/api-reference/functions/refresh",
    "/docs/app/api-reference/functions/cache",
    "/docs/app/getting-started/caching",
  ];
  const docs = await Promise.all(
    wanted.map(path => codemode.nextjs_docs({ path }))
  );
  return docs.map(d => ({ path: d.path, head: d.content?.slice(0, 400) }));
}
\`\`\`

### Cross-stack lookups

Different stacks are independent — fan out across them in the same \`Promise.all\`:

\`\`\`js
async () => {
  const [nextIdx, reactIdx] = await Promise.all([
    codemode.nextjs_index(),
    codemode.react_index(),
  ]);
  const nextPath = nextIdx.split("\\n").find(l => l.includes("use-cache"));
  const reactPath = reactIdx.split("\\n").find(l => l.includes("useTransition"));
  const [a, b] = await Promise.all([
    codemode.nextjs_docs({ path: extractPath(nextPath) }),
    codemode.react_docs({ path: extractPath(reactPath) }),
  ]);
  return { next: a.url, react: b.url };
}
\`\`\`

(Note that you'd inline \`extractPath\` inside the function — no named helpers.)

### Searching the index

The indices are markdown link lists, roughly:

\`\`\`
- [Functions: refresh](https://nextjs.org/docs/app/api-reference/functions/refresh): Refresh the client router from a Server Action.
- [Functions: cache](https://nextjs.org/docs/app/api-reference/functions/cache): ...
\`\`\`

Treat them as plain text. \`String.prototype.includes\`, \`String.prototype.split("\\n")\`, and a \`.filter(...)\` is enough. Don't try to parse markdown formally — a substring match against the topic is faster and just as reliable.

A reusable shape for "find the first matching path":

\`\`\`js
const matches = index
  .split("\\n")
  .filter(line => /caching|use-cache/i.test(line))
  .map(line => line.match(/\\((https?:\\/\\/[^)]+)\\)/)?.[1])
  .filter(Boolean);
\`\`\`

### Return only what's needed

Doc payloads vary from 2 KB to 30+ KB. Returning the full \`content\` for ten docs in one call dumps ~200 KB of markdown into the conversation. Prefer:

- A summary you compose inside the sandbox (\`d.content.slice(0, 800)\`).
- The URL plus a one-line excerpt the user can act on.
- Just the structured info the user asked for (e.g., the function signature, not the whole page).

\`\`\`js
async () => {
  const r = await codemode.react_docs({ path: "/reference/react/useState.md" });
  // Pull just the synopsis section to keep the return small.
  const synopsis = r.content?.split("\\n## ")[0];
  return { url: r.url, synopsis };
}
\`\`\`

If the user explicitly wants the full doc, return the full \`content\`. Otherwise, summarize in-sandbox.

### Error handling

\`error\` and \`message\` are structured fields on the return value. Branch on them; do not throw:

\`\`\`js
async () => {
  const r = await codemode.supabase_docs({ path: "/docs/reference/auth" });
  if (r.error === "OUT_OF_SCOPE") {
    // Re-fetch the right index and pick a /docs/guides/** path.
    const idx = await codemode.supabase_index();
    return { needRetry: true, idxHead: idx.slice(0, 600) };
  }
  return r.content?.slice(0, 1000);
}
\`\`\`

\`try/catch\` works the way you expect — it catches transport-level errors only (5xx, fetch failures). 404, scope violations, and Pages-Router rejection are all in \`error\` instead.

### Debugging with logs

\`console.log\` / \`console.warn\` / \`console.error\` are captured and surfaced as a \`[logs]\` content block. They do not affect your return value. Useful when you want to see what the index looked like without dumping it into the result:

\`\`\`js
async () => {
  const idx = await codemode.nextjs_index();
  const lines = idx.split("\\n").filter(l => l.includes("caching"));
  console.log("matched lines:", lines.length);
  return lines.slice(0, 5);
}
\`\`\`

## Sandbox limits

- **30-second async timeout.** If your function (or any tool call inside it) is still pending after 30s, you get an \`Execution timed out after 30000ms\` error. The timeout is enforced via \`Promise.race\`, so a synchronous infinite loop is *not* bounded — don't write one.
- **Soft sandbox.** The executor is a Node \`AsyncFunction\`, not a vm context. Host globals (\`fetch\`, \`process\`, \`setTimeout\`, \`node:fs\`) are technically reachable, but the contract is the \`codemode.*\` SDK — stay on it. \`console.log\` / \`error\` / \`warn\` are shadowed and routed to the \`[logs]\` block. If your task needs a capability Citadel does not expose, ask for that capability to be added rather than reaching into the host.
- **No streaming.** A \`docs\` call is one request and one response. If you need progressive results, return them in batches across multiple calls.
- **Payload truncation.** There is currently no enforced cap on response size, but the host conversation has its own limits. Be deliberate about what you return.

## Common mistakes

- **Skipping the index.** Guessing a path almost always fails with \`NOT_FOUND\`. Read the index first; it's cheap.
- **Sequential awaits when parallel is possible.** This is the single biggest waste of your turn budget. If two calls don't depend on each other, \`Promise.all\` them.
- **TypeScript syntax.** No type annotations. No \`as\`, no generics, no \`interface\`. Plain JS only.
- **Defining and calling a named function.** \`async function helper() { ... }; return helper()\` does not work. Inline the body.
- **Returning the whole \`content\` field for many docs.** That's a context-blowup. Slice or summarize.
- **Calling \`r.content.slice(...)\` without checking \`r.error\` first.** When \`error\` is set, \`content\` is undefined and you'll throw inside the sandbox.
- **Treating Supabase like the others.** Its scope is \`/docs/guides/**\` only. Don't pass \`/docs/reference/...\` paths to \`supabase_docs\`.
- **Treating Next.js Pages Router paths as valid.** They're rejected with \`PAGES_ROUTER_NOT_SUPPORTED\`. Find the App Router equivalent in the index.

## Worked examples

### Look up a single doc

\`\`\`js
async () => {
  const idx = await codemode.nextjs_index();
  const line = idx.split("\\n").find(l => l.toLowerCase().includes("server actions"));
  const path = line?.match(/\\((https?:\\/\\/[^)]+)\\)/)?.[1]?.replace("https://nextjs.org", "");
  if (!path) return { error: "no match", head: idx.slice(0, 300) };
  const r = await codemode.nextjs_docs({ path });
  return { url: r.url, content: r.content };
}
\`\`\`

### Compare two related concepts in one turn

\`\`\`js
async () => {
  const idx = await codemode.nextjs_index();
  const grab = needle =>
    idx.split("\\n").find(l => l.toLowerCase().includes(needle))
       ?.match(/\\((https?:\\/\\/[^)]+)\\)/)?.[1]
       ?.replace("https://nextjs.org", "");
  const [refreshPath, revalidatePath] = ["refresh", "revalidatepath"].map(grab);
  const [a, b] = await Promise.all([
    codemode.nextjs_docs({ path: refreshPath }),
    codemode.nextjs_docs({ path: revalidatePath }),
  ]);
  return [
    { name: "refresh", url: a.url, head: a.content?.slice(0, 600) },
    { name: "revalidatePath", url: b.url, head: b.content?.slice(0, 600) },
  ];
}
\`\`\`

### Survey a topic across the index without fetching every doc

\`\`\`js
async () => {
  const idx = await codemode.react_index();
  const hits = idx
    .split("\\n")
    .filter(l => /transition|deferred|optimistic/i.test(l))
    .slice(0, 12);
  return hits;
}
\`\`\`

### Recover from an out-of-scope mistake without a second turn

\`\`\`js
async () => {
  const first = await codemode.supabase_docs({ path: "/docs/reference/auth" });
  if (first.error === "OUT_OF_SCOPE") {
    const idx = await codemode.supabase_index();
    const guidesPath = idx.split("\\n")
      .find(l => l.includes("/docs/guides/auth"))
      ?.match(/\\((https?:\\/\\/[^)]+)\\)/)?.[1]
      ?.replace("https://supabase.com", "");
    if (guidesPath) {
      const r = await codemode.supabase_docs({ path: guidesPath });
      return { recoveredFrom: "OUT_OF_SCOPE", url: r.url, head: r.content?.slice(0, 600) };
    }
  }
  return first;
}
\`\`\`

### Cross-stack: how does Next.js' caching map to React's primitives

\`\`\`js
async () => {
  const [nextIdx, reactIdx] = await Promise.all([
    codemode.nextjs_index(),
    codemode.react_index(),
  ]);
  const nextHits = nextIdx.split("\\n").filter(l => /caching|use-cache|cache components/i.test(l)).slice(0, 5);
  const reactHits = reactIdx.split("\\n").filter(l => /cache|memo|use\\b/i.test(l)).slice(0, 5);
  return { next: nextHits, react: reactHits };
}
\`\`\`

## When *not* to use Citadel

- **The user asked for code, not docs.** Don't hit Citadel for trivia you already know — only for current, version-specific reference material.
- **A different MCP server covers the topic better.** If the user has Context7 or a vendor-specific MCP installed, prefer those for vendors Citadel doesn't ship.
- **You only need one fact.** If you genuinely need exactly one paragraph from one doc, do call it — but return only what was asked, not the full doc.

If you're about to make multiple calls in sequence, stop and ask whether they could be one \`docs\` call with \`Promise.all\`. The answer is almost always yes.
`;

export function handler(): Promise<string> {
  return Promise.resolve(AGENT_USAGE_MD);
}
