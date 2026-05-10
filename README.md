# Citadel MCP

[![npm citadel-mcp package](https://img.shields.io/npm/v/citadel-mcp.svg)](https://npmjs.org/package/citadel-mcp)

A Code Mode MCP server that gives AI coding agents curated, per-stack documentation as typed tools.

Citadel is built to be **forked and tailored**. The hosted package ships with a small starter set of stacks, but the real value comes from packaging the docs your agents actually need. Each stack is a tiny module — adding one is mostly mechanical.

## Getting Started

### Requirements

- [Node.js](https://nodejs.org/) v20.19 or a newer [latest maintenance LTS](https://github.com/nodejs/Release#release-schedule) version
- [npm](https://www.npmjs.com/) or [pnpm](https://pnpm.io/)

### Install with add-mcp

Install the MCP server for all your coding agents:

```bash
npx add-mcp citadel-mcp@latest
```

Add `-y` to skip the confirmation prompt and install to all detected agents already in use in the project directory. Add `-g` to install globally across all projects.

### Manual installation

Add the following config to your MCP client:

```json
{
  "mcpServers": {
    "citadel": {
      "command": "npx",
      "args": ["-y", "citadel-mcp@latest"]
    }
  }
}
```

> [!NOTE]
> Using `citadel-mcp@latest` ensures that your MCP client will always use the latest version of the Citadel MCP server.

### MCP Client Configuration

<details>
<summary>Amp</summary>

**Using Amp CLI:**

```bash
amp mcp add citadel -- npx citadel-mcp@latest
```

**Or configure manually:**

Follow [Amp's MCP documentation](https://ampcode.com/manual#mcp) and apply the standard configuration shown above.

</details>

<details>
<summary>Claude Code</summary>

Use the Claude Code CLI to add the Citadel MCP server:

```bash
claude mcp add -s user citadel -- npx -y citadel-mcp@latest
```

Use `-s project` instead of `-s user` to scope the install to the current project. Restart Claude Code, then verify with `claude mcp list`. A working server advertises a single tool named `docs`.

</details>

<details>
<summary>Codex</summary>

**Using Codex CLI:**

```bash
codex mcp add citadel -- npx citadel-mcp@latest
```

**Or configure manually:**

Follow the MCP setup guide with the standard configuration format:
- Command: `npx`
- Arguments: `-y, citadel-mcp@latest`

</details>

<details>
<summary>Cursor</summary>

Go to `Cursor Settings` -> `MCP` -> `New MCP Server`. Use the JSON config provided above.

</details>

<details>
<summary>Gemini</summary>

**Using Gemini CLI:**

Project-wide installation:
```bash
gemini mcp add citadel npx citadel-mcp@latest
```

Global installation:
```bash
gemini mcp add -s user citadel npx citadel-mcp@latest
```

</details>

<details>
<summary>VS Code / Copilot</summary>

**Using VS Code CLI:**

```bash
code --add-mcp '{"name":"citadel","command":"npx","args":["-y","citadel-mcp@latest"]}'
```

**Or configure manually:**

Follow the official VS Code MCP server setup guide and add the Citadel server through VS Code settings.

</details>

<details>
<summary>Warp</summary>

Navigate to `Settings | AI | Manage MCP Servers` and select `+ Add` to register a new MCP server with the following configuration:
- Name: `citadel`
- Command: `npx`
- Arguments: `-y, citadel-mcp@latest`

</details>

## What you get out of the box

The hosted package includes a starter set of stacks so you can try it immediately:

- Next.js (App Router, Next.js 16)
- React
- Turborepo
- Supabase guides

This list is intentionally small. **For the best results, fork this repo and add the stacks your agents care about** — your internal libraries, the framework version you actually use, or any docs site that publishes machine-readable markdown. See [docs/adding-a-docs-tool.md](docs/adding-a-docs-tool.md).

## How it works

Citadel is a Code Mode server: instead of advertising one tool per docs source, it advertises a single `docs` tool. The agent writes one `async () => { ... }` per turn that calls `codemode.<stack>_docs(...)` and `codemode.<stack>_index()` directly, and the server runs that code in a local Node sandbox. N doc fetches collapse into one round-trip.

Each stack contributes two callable tools to the sandbox SDK:

- `<stack>_index()` — returns the doc index so the agent can pick a valid path
- `<stack>_docs({ path })` — fetches that specific doc as markdown

Citadel also exposes a cross-stack ranked search: `codemode.docs_search({ query, stacks?, fetch: true })` returns BM25-ranked matches with markdown content attached in a single call.

## Documentation

- [Using Citadel as an AI agent](src/resources/agent-usage.ts) — playbook for the `docs` tool, served at runtime as MCP resource `citadel://docs/agent-usage`. SDK reference, parallel fan-out, error handling, worked examples.
- [Adding a docs tool](docs/adding-a-docs-tool.md) — package a new stack as `<stack>_index` + `<stack>_docs`.

## Local Development

To run the MCP server locally for development:

1. Clone the repository.
2. Install and build:
   ```bash
   pnpm install
   pnpm build
   ```
3. Configure your MCP client to use the local version:
   ```json
   {
     "mcpServers": {
       "citadel-dev": {
         "command": "node",
         "args": ["/absolute/path/to/citadel-mcp/dist/index.js"]
       }
     }
   }
   ```

   Or with the Claude Code CLI:
   ```bash
   claude mcp add -s user citadel-dev -- node /absolute/path/to/citadel-mcp/dist/index.js
   ```

For development with auto-reload, point the MCP client at `tsx` and the `src` entry instead:

```bash
claude mcp add -s user citadel-dev -- npx tsx /absolute/path/to/citadel-mcp/src/index.ts
```

## License

MIT
