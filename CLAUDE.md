# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Citadel is an MCP (Model Context Protocol) server that bundles per-stack documentation tools for AI coding assistants. The repo currently ships Next.js (App Router, Next.js 16), React, Turborepo, and Supabase (guides) coverage, and is structured to grow with additional tech stacks over time.

The server is built using the standard `@modelcontextprotocol/sdk` package with TypeScript and ES modules.

## Build and Development Commands

```bash
# Install dependencies
pnpm install

# Build the project
pnpm build

# Watch mode for development
pnpm dev

# Type check
pnpm typecheck

# Clean build artifacts
pnpm clean
```

## Architecture

### MCP Server Structure

The main server entry point is `src/index.ts` which uses the standard MCP SDK with stdio transport. The server manually registers:

- **Tools** (`src/tools/`): Callable functions for automation - each exports `inputSchema`, `metadata`, and `handler`
- **Resources** (`src/resources/`): Knowledge base articles and documentation - each exports `metadata` and `handler`

All tools and resources are explicitly imported and registered in `src/index.ts`.

### Key Components

**MCP Tools** (`src/tools/`):

- Each tool exports: `inputSchema` (Zod schemas), `metadata` (name, description), `handler` (async function)
- Tools are manually imported and registered in `src/index.ts`
- `nextjs_docs`: Fetch Next.js documentation (App Router, Next.js 16 only)
- `react_docs`: Fetch React documentation
- `turborepo_docs`: Fetch Turborepo documentation
- `supabase_docs`: Fetch a Supabase guide (`/docs/guides/**` only)

**Resources Architecture**:

- Resources are grouped by stack/topic into parenthesized folders under `src/resources/` (e.g., `(nextjs-docs)/`, `(react-docs)/`, `(turborepo-docs)/`, `(supabase-docs)/`). Add a new folder per stack as coverage expands.
- Each resource exports: `metadata` (uri, name, description, mimeType) and `handler` (function returning content)
- Resources use URI-based addressing (e.g., `nextjs-docs://llms-index`, `supabase-docs://guides-index`)
- All current resources are runtime-fetched indexes built with `createCachedTextResource` from `src/_internal/cached-fetch.ts` (1h in-memory cache with stale-on-failure fallback). The helper accepts an optional `transform` callback for sources that need post-processing (e.g., Supabase parses `sitemap.xml`).

### TypeScript Configuration

- Target: ES2022, ES modules (NodeNext module resolution)
- Strict mode enabled
- Output directory: `dist/`
- Declaration files generated
- Package marked as `"type": "module"` for native ES module support

## Build Process

`pnpm build` runs `tsc`, which compiles all TypeScript files from `src/` to `dist/`. The `dist/index.js` file is the entry point for the MCP server and includes a shebang for CLI execution. There is no separate resource-copy step — every resource currently fetches its content at runtime.

## MCP Protocol Integration

Citadel runs as a standalone MCP server over stdio using `@modelcontextprotocol/sdk`.

**Key MCP Patterns**:

- Server uses standard MCP SDK `Server` class with `StdioServerTransport`
- Tools use Zod schemas for input validation, converted to JSON Schema for MCP
- Tool handlers are called with validated arguments
- Resources use URI-based addressing (e.g., `nextjs-docs://llms-index`)

## Common Development Patterns

**Adding a new MCP tool**:

1. Create tool file in `src/tools/` with:
   - `export const inputSchema = { ... }` - Zod schemas for each parameter
   - `export const metadata = { name, description }`
   - `export async function handler(args) { ... }` - Tool implementation
2. Import and add to the `tools` array in `src/index.ts`
3. Run `pnpm build` and `pnpm typecheck`

**Adding a new MCP resource**:

1. Create a handler file under `src/resources/(<stack>)/` using `createCachedTextResource` from `src/_internal/cached-fetch.ts` (pass `url`, `sourceLabel`, and an optional `transform` if the upstream needs post-processing).
2. Export `metadata = { uri, name, description, mimeType }` and `handler` from the module.
3. Import and add to the `resources` array in `src/index.ts`.

**Adding a new docs tool for an external stack**:

1. Add a runtime-fetched index resource as above (URI like `<stack>-docs://llms-index`).
2. Add a tool in `src/tools/<stack>-docs.ts` that takes a `path` parameter, validates/normalizes it, fetches the upstream markdown, and returns `{ path, url, content }` as JSON. Mirror existing tools (`nextjs-docs.ts`, `react-docs.ts`, `turborepo-docs.ts`, `supabase-docs.ts`).
3. Register both in `src/index.ts`.

## Package Publishing

- Package name: `citadel-mcp`
- Package type: ES module (`"type": "module"`)
- Binary: `citadel-mcp` points to `dist/index.js`
- prepublishOnly hook: cleans and rebuilds before publishing
- Use `pnpm@10.33.0` as package manager
