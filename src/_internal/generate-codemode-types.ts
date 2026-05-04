// Generates the TypeScript declarations the LLM reads inside the `code`
// tool description. Pure: takes upstream tool descriptors, returns a
// string containing `type {Name}Input/Output` aliases and a
// `declare const codemode` block with method signatures.

const JS_RESERVED = new Set([
  "break", "case", "catch", "class", "const", "continue", "debugger",
  "default", "delete", "do", "else", "enum", "export", "extends", "false",
  "finally", "for", "function", "if", "import", "in", "instanceof", "new",
  "null", "return", "super", "switch", "this", "throw", "true", "try",
  "typeof", "var", "void", "while", "with", "yield",
]);

export function sanitizeToolName(name: string): string {
  if (!name) return "_";
  let s = name.replace(/[-.\s]/g, "_").replace(/[^a-zA-Z0-9_$]/g, "");
  if (!s) return "_";
  if (/^[0-9]/.test(s)) s = "_" + s;
  if (JS_RESERVED.has(s)) s = s + "_";
  return s;
}

function toPascalCase(s: string): string {
  return s
    .replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/^[a-z]/, (c) => c.toUpperCase());
}

export type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  description?: string;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  enum?: unknown[];
};

export type ToolDescriptor = {
  name: string;
  description?: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
};

function primitiveToTs(t: string | undefined): string {
  if (t === "string") return "string";
  if (t === "number" || t === "integer") return "number";
  if (t === "boolean") return "boolean";
  if (t === "null") return "null";
  return "unknown";
}

function jsonSchemaToTs(schema: JsonSchema | undefined, indent = ""): string {
  if (!schema || typeof schema !== "object") return "unknown";
  if (schema.anyOf)
    return schema.anyOf.map((s) => jsonSchemaToTs(s, indent)).join(" | ");
  if (schema.oneOf)
    return schema.oneOf.map((s) => jsonSchemaToTs(s, indent)).join(" | ");
  if (schema.enum && schema.enum.length > 0) {
    return schema.enum
      .map((v) =>
        v === null
          ? "null"
          : typeof v === "string"
            ? JSON.stringify(v)
            : String(v),
      )
      .join(" | ");
  }
  const t = schema.type;
  if (Array.isArray(t)) {
    return t.map((primitive) => primitiveToTs(primitive)).join(" | ");
  }
  if (t === "object" || schema.properties) {
    const props = schema.properties ?? {};
    const required = new Set(schema.required ?? []);
    const inner = "  " + indent;
    const lines: string[] = [];
    for (const [key, value] of Object.entries(props)) {
      const desc = value.description
        ? `${inner}/** ${value.description.replace(/\*\//g, "*\\/")} */\n`
        : "";
      const opt = required.has(key) ? "" : "?";
      lines.push(
        `${desc}${inner}${key}${opt}: ${jsonSchemaToTs(value, inner)};`,
      );
    }
    if (lines.length === 0) return "Record<string, never>";
    return `{\n${lines.join("\n")}\n${indent}}`;
  }
  if (t === "array") return `${jsonSchemaToTs(schema.items, indent)}[]`;
  return primitiveToTs(t);
}

function hasNoInputProperties(schema: JsonSchema | undefined): boolean {
  if (!schema) return true;
  const props = schema.properties;
  if (!props) return true;
  return Object.keys(props).length === 0;
}

const CODEMODE_JSDOC = `/**
 * Sandbox SDK. Each method calls an MCP tool over the wire (one network round-trip per call).
 * Fan out parallel calls with Promise.all to batch fetches into one server hop.
 */`;

export function generateCodemodeTypes(
  tools: ReadonlyArray<ToolDescriptor>,
): string {
  const types: string[] = [];
  const methods: string[] = [];
  for (const tool of tools) {
    const safe = sanitizeToolName(tool.name);
    const typeName = toPascalCase(safe);
    const noInput = hasNoInputProperties(tool.inputSchema);
    const outputType = tool.outputSchema
      ? jsonSchemaToTs(tool.outputSchema)
      : tool.name.endsWith("_index")
        ? "string"
        : "unknown";

    if (!noInput) {
      types.push(
        `type ${typeName}Input = ${jsonSchemaToTs(tool.inputSchema)};`,
      );
    }
    types.push(`type ${typeName}Output = ${outputType};`);

    const docLines: string[] = [];
    if (tool.description?.trim()) {
      docLines.push(tool.description.trim().replace(/\r?\n/g, " "));
    }
    const props = tool.inputSchema?.properties ?? {};
    for (const [key, value] of Object.entries(props)) {
      if (value.description) {
        docLines.push(
          `@param input.${key} - ${value.description.replace(/\r?\n/g, " ")}`,
        );
      }
    }
    const jsdoc = docLines.length
      ? `  /**\n${docLines.map((l) => `   * ${l.replace(/\*\//g, "*\\/")}`).join("\n")}\n   */\n`
      : "";
    const signature = noInput
      ? `() => Promise<${typeName}Output>`
      : `(input: ${typeName}Input) => Promise<${typeName}Output>`;
    methods.push(`${jsdoc}  ${safe}: ${signature};`);
  }
  return `${types.join("\n")}\n\n${CODEMODE_JSDOC}\ndeclare const codemode: {\n${methods.join("\n")}\n};`;
}

function buildSingleCallExample(tool: ToolDescriptor): string {
  const props = tool.inputSchema?.properties ?? {};
  const parts: string[] = [];
  for (const [key, prop] of Object.entries(props)) {
    const t = prop.type;
    if (t === "number" || t === "integer") parts.push(`${key}: 0`);
    else if (t === "boolean") parts.push(`${key}: true`);
    else parts.push(`${key}: "..."`);
  }
  const call =
    parts.length === 0
      ? `codemode.${sanitizeToolName(tool.name)}()`
      : `codemode.${sanitizeToolName(tool.name)}({ ${parts.join(", ")} })`;
  return `Example: async () => { const r = await ${call}; return r; }`;
}

function buildFanOutExample(indexTools: ToolDescriptor[]): string {
  const calls = indexTools
    .map((t) => `codemode.${sanitizeToolName(t.name)}()`)
    .join(",\n    ");
  const names = indexTools.map((t) =>
    sanitizeToolName(t.name).replace(/_index$/, "Idx"),
  );
  return `Example (parallel cross-stack survey):
async () => {
  const [${names.join(", ")}] = await Promise.all([
    ${calls},
  ]);
  // Pick relevant paths from each index, then fan out doc fetches with another Promise.all.
  return { ${names.join(", ")} };
}`;
}

export function buildCodeExample(
  tools: ReadonlyArray<ToolDescriptor>,
): string {
  const indexTools = tools.filter((t) => t.name.endsWith("_index"));
  if (indexTools.length >= 2) return buildFanOutExample(indexTools);
  const first = tools[0];
  if (!first) return "";
  return buildSingleCallExample(first);
}
