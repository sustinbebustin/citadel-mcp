# Citadel MCP

A Model Context Protocol (MCP) server that bundles per-stack documentation tools for coding agents. Currently covers Next.js (App Router, Next.js 16), React, Turborepo, and Supabase guides.

## Tools

- **`nextjs_docs`** -- Fetch Next.js official documentation by path. App Router on Next.js 16 only; Pages Router paths are rejected. Read the `nextjs-docs://llms-index` resource first to get the correct path.
- **`react_docs`** -- Fetch React official documentation by path. Read the `react-docs://llms-index` resource first to get the correct path.
- **`turborepo_docs`** -- Fetch Turborepo official documentation by path. Read the `turborepo-docs://llms-index` resource first to get the correct path.
- **`supabase_docs`** -- Fetch a Supabase guide by path. Scoped to `/docs/guides/**` content. Read the `supabase-docs://guides-index` resource first to get the correct path.

## Resources

- `nextjs-docs://llms-index` -- Cached Next.js documentation index from `nextjs.org/docs/llms.txt` (App Router, Next.js 16).
- `react-docs://llms-index` -- Cached React documentation index from `react.dev/llms.txt`.
- `turborepo-docs://llms-index` -- Cached Turborepo documentation index from `turborepo.dev/llms.txt`.
- `supabase-docs://guides-index` -- Supabase guides index built from `supabase.com/docs/sitemap.xml`, filtered to `/docs/guides/**` and grouped by category.

## MCP client config

```json
{
  "mcpServers": {
    "citadel": {
      "command": "node",
      "args": ["/absolute/path/to/citadel-mcp/dist/index.js"]
    }
  }
}
```

## Local development

```bash
pnpm install
pnpm build
pnpm typecheck
```

The server entry point is `dist/index.js`. Run it directly over stdio for smoke testing:

```bash
node dist/index.js
```

## License

MIT
