import { describe, expect, test } from "vitest";
import {
  CODE_DESCRIPTION,
  expandCodeDescription,
} from "./code-description.js";

describe("CODE_DESCRIPTION", () => {
  test("explicitly explains codemode.<tool>(args) is callable", () => {
    expect(CODE_DESCRIPTION).toMatch(/codemode\.<tool/);
  });

  test("teaches Promise.all fan-out as the primary use case", () => {
    expect(CODE_DESCRIPTION).toMatch(/Promise\.all/);
  });

  test("declares the sandbox is JavaScript (not TS) and async", () => {
    expect(CODE_DESCRIPTION).toMatch(/JavaScript/);
    expect(CODE_DESCRIPTION).toMatch(/async/);
  });

  test("includes both {{types}} and {{example}} substitution slots", () => {
    expect(CODE_DESCRIPTION).toContain("{{types}}");
    expect(CODE_DESCRIPTION).toContain("{{example}}");
  });

  test("mentions the 30s execution budget so agents bound their work", () => {
    expect(CODE_DESCRIPTION).toMatch(/30s|30 second/i);
  });

  test("points at the agent-usage MCP resource for deeper patterns", () => {
    expect(CODE_DESCRIPTION).toMatch(/citadel:\/\/docs\/agent-usage/);
  });
});

describe("expandCodeDescription", () => {
  test("substitutes both placeholders", () => {
    const out = expandCodeDescription({
      types: "TYPES_HERE",
      example: "EXAMPLE_HERE",
    });
    expect(out).toContain("TYPES_HERE");
    expect(out).toContain("EXAMPLE_HERE");
    expect(out).not.toContain("{{types}}");
    expect(out).not.toContain("{{example}}");
  });
});
