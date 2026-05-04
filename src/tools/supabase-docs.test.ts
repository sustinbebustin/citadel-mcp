import { describe, expect, test, vi } from "vitest";
import { handler } from "./supabase-docs.js";

describe("supabase_docs handler path normalization", () => {
  test("strips trailing slash before appending .md", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("body", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await handler({ path: "/docs/guides/auth/" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://supabase.com/docs/guides/auth.md",
    );
  });

  test("strips fragment before appending .md", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("body", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await handler({ path: "/docs/guides/functions/auth#oauth" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://supabase.com/docs/guides/functions/auth.md",
    );
  });

  test("returns OUT_OF_SCOPE for paths outside /docs/guides/", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = JSON.parse(await handler({ path: "/docs/reference/foo" }));

    expect(result.error).toBe("OUT_OF_SCOPE");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
