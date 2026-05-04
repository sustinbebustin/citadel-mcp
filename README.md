# Citadel MCP

A Code Mode MCP server that gives AI coding agents curated, per-stack documentation as typed tools.

Citadel is built to be **forked and tailored**. The hosted package ships with a small starter set of stacks, but the real value comes from packaging the docs your agents actually need. Each stack is a tiny module — adding one is mostly mechanical.

## Install (hosted)

Project-scoped:

```bash
claude mcp add -s project citadel -- npx -y citadel-mcp@latest
```

Globally for your user:

```bash
claude mcp add -s user citadel -- npx -y citadel-mcp@latest
```

Restart Claude Code, then verify with `claude mcp list`. A working server advertises a single tool named `code`.

## What you get out of the box

The hosted package includes a starter set of stacks so you can try it immediately:

- Next.js (App Router, Next.js 16)
- React
- Turborepo
- Supabase guides

This list is intentionally small. **For the best results, fork this repo and add the stacks your agents care about** — your internal libraries, the framework version you actually use, or any docs site that publishes machine-readable markdown. See [docs/adding-a-docs-tool.md](docs/adding-a-docs-tool.md).

## How it works

Citadel is a Code Mode server: instead of advertising one tool per docs source, it advertises a single `code` tool. The agent writes one `async () => { ... }` per turn that calls `codemode.<stack>_docs(...)` and `codemode.<stack>_index()` directly, and the server runs that code in a local Node sandbox. N doc fetches collapse into one round-trip.

Each stack contributes two callable tools to the sandbox SDK:

- `<stack>_index()` — returns the doc index so the agent can pick a valid path
- `<stack>_docs({ path })` — fetches that specific doc as markdown

## Run from a local checkout

```bash
pnpm install
pnpm build
claude mcp add -s user citadel-dev -- node /absolute/path/to/citadel-mcp/dist/index.js
```

For development with auto-reload:

```bash
claude mcp add -s user citadel-dev -- npx tsx /absolute/path/to/citadel-mcp/src/index.ts
```

## Documentation

- [Adding a docs tool](docs/adding-a-docs-tool.md) — package a new stack as `<stack>_index` + `<stack>_docs`

## License

MIT
