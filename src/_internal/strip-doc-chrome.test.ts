import { describe, expect, test } from "vitest";
import { stripDocChrome } from "./strip-doc-chrome.js";

describe("stripDocChrome", () => {
  test("removes YAML frontmatter at top", () => {
    const input = '---\ntitle: foo\nurl: "x"\n---\n\nbody';
    expect(stripDocChrome(input)).toBe("body");
  });

  test("removes the llms.txt nav banner", () => {
    const input =
      "> For an index of all Next.js documentation, see https://nextjs.org/docs/llms.txt.\n\n# Real Title\n\nbody";
    expect(stripDocChrome(input)).toBe("# Real Title\n\nbody");
  });

  test("removes the semantic-overview footer", () => {
    const input =
      "# Title\n\nbody\n\n---\n\nFor a semantic overview see ...\nblah blah";
    expect(stripDocChrome(input)).toBe("# Title\n\nbody");
  });

  test("is a no-op on clean markdown", () => {
    const input = "# Title\n\nA paragraph that has no chrome.";
    expect(stripDocChrome(input)).toBe(input);
  });

  test("trims trailing and leading whitespace", () => {
    expect(stripDocChrome("\n\n# Title\n\nbody\n\n")).toBe("# Title\n\nbody");
  });
});
