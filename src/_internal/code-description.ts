// The static preamble for the `docs` tool description. The two
// placeholders are filled in at server startup with the generated SDK
// types and a concrete example matching the registered tools.
export const CODE_DESCRIPTION = `Run JavaScript in a local Node sandbox. Write ONE async arrow function that returns a value.

Inside the sandbox you have:
  - codemode.<tool_name>(args) — calls an MCP tool over the wire. Each codemode.* method below is a real callable.
  - fetch, Promise, JSON, standard async — Node 18+ globals.
  - 30s async timeout (sync infinite loops are not bounded). One call, one result; no streaming.

Fan out independent calls with Promise.all — that is why this tool exists. N tool calls collapse into one MCP round-trip.

Available tools:
{{types}}

Example (parallel cross-stack survey, the common case):
{{example}}

Return the value the caller needs. If you console.log, output is captured in a [logs] block alongside the result. For deeper patterns read the MCP resource \`citadel://docs/agent-usage\`.`;

export function expandCodeDescription(params: {
  types: string;
  example: string;
}): string {
  return CODE_DESCRIPTION.replace("{{types}}", params.types).replace(
    "{{example}}",
    params.example,
  );
}
