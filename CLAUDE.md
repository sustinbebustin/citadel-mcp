# CLAUDE.md

Operating context for Claude Code in this repo.

## What this is

Citadel is a Code Mode MCP server. It advertises one tool — `code` — whose description embeds TS signatures for every upstream docs tool. The agent writes one `async () => { ... }` per turn that calls `codemode.<tool>(args)`; the server runs it in a local Node sandbox. N doc fetches collapse into one round-trip.

## Layout

- `src/index.ts` — entry; builds upstream `McpServer`, wraps with `buildCodeServer`, runs over `StdioServerTransport`.
- `src/tools/<stack>-docs.ts` — per-stack fetch tool. Exports `inputSchema` (flat Zod object), `metadata` (`{ name, description }`), `handler` (`async (args) => Promise<string>`, always `JSON.stringify(...)`).
- `src/resources/(<stack>-docs)/<index>.ts` — per-stack index. Exports `metadata` (`{ uri, name, description, mimeType }` — `uri` is unused at runtime, kept for clarity) and `handler` (`() => Promise<string>` from `createCachedTextResource`).
- `src/_internal/cached-fetch.ts` — `createCachedTextResource` (1h TTL, stale-on-failure).
- `src/_internal/strip-doc-chrome.ts` — vendor frontmatter/footer stripper.

## Registration in `src/index.ts`

- `registerDocsTool(server, metadata, inputSchema, handler)` — registers a docs tool with `outputSchema: docResultSchema` and surfaces parsed JSON as `structuredContent`.
- `registerIndexTool(server, toolName, stackLabel, fetchPathTool, resource)` — registers an index as a no-arg tool.
- Both names appear automatically in the sandbox SDK types.

## buildCodeServer (inline, not imported)

Equivalent to `codeMcpServer` from `@cloudflare/codemode/mcp`, with one difference: it propagates each upstream tool's `outputSchema` into the generated TS contract so the sandbox sees real return types. codemode 0.2.x's `codeMcpServer` drops `outputSchema`; using it would require zod 4. Do not switch to the imported version without that upgrade.

Runtime imports of `@cloudflare/codemode` are unsafe — its `index.js` transitively imports `cloudflare:workers`, which Node cannot resolve. Use `import type` only.

## NodeVMExecutor (inline)

Two load-bearing guards when editing:

- Sandbox `console` is shadowed and routed to `ExecuteResult.logs` (also surfaced as a `[logs]` content block). Without this, sandbox `console.log` writes corrupt the JSON-RPC stream that `StdioServerTransport` owns.
- `Promise.race` against a 30s `setTimeout` bounds runaway async code. Synchronous infinite loops are not bounded — would require `node:vm`. See `~/.claude/skills/codemode/references/local-executor.md:179`.

`wrapProviderFns` unwraps MCP `CallToolResult` shapes so sandbox code sees parsed JSON and `try/catch` works on tool errors.

## Hard rules

- Never write to stdout. Use `console.error` for diagnostics. `StdioServerTransport` owns stdout.
- Do not pass `needsApproval: true` tools to `buildCodeServer`. Code Mode has no approval flow — tools run immediately in the sandbox. Such tools belong in a separate, non-codemode server.
- The local executor has no network sandbox. Trust boundary is the user plus Claude Code.

## Adding a stack

See `docs/adding-a-docs-tool.md` for the full procedure. In short: add the index resource, add the fetch tool, register both in `src/index.ts`, run `pnpm typecheck && pnpm build`.

## Verify changes

```bash
pnpm typecheck
pnpm build
```

`dist/index.js` is the executable entry (preserves `#!/usr/bin/env node`). Smoke test: `node dist/index.js` over stdio, or restart a registered Claude Code instance.

## TypeScript config

- ES2022, ES modules, NodeNext resolution, strict mode, declarations emitted.
- `"type": "module"`.
