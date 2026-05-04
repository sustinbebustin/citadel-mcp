import { describe, expect, test, vi } from "vitest";
import { handler } from "./nextjs-docs.js";

describe("nextjs_docs handler", () => {
  test("appends .md when path lacks extension", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("# Refresh\n\nbody", {
        status: 200,
        headers: { "content-type": "text/markdown" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const raw = await handler({
      path: "/docs/app/api-reference/functions/refresh",
    });
    const result = JSON.parse(raw);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://nextjs.org/docs/app/api-reference/functions/refresh.md",
    );
    expect(result.content).toContain("# Refresh");
    expect(result.error).toBeUndefined();
  });

  test("does not double-append .md when path already ends .md", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("body", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await handler({ path: "/docs/app/foo.md" });

    expect(fetchMock).toHaveBeenCalledWith("https://nextjs.org/docs/app/foo.md");
  });

  test("returns OUT_OF_SCOPE for paths not starting with /docs/", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = JSON.parse(await handler({ path: "/about" }));

    expect(result.error).toBe("OUT_OF_SCOPE");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("returns PAGES_ROUTER_NOT_SUPPORTED for /docs/pages/", async () => {
    const result = JSON.parse(await handler({ path: "/docs/pages/api" }));
    expect(result.error).toBe("PAGES_ROUTER_NOT_SUPPORTED");
  });

  test("returns NOT_FOUND structured error on 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 404 })),
    );
    const result = JSON.parse(await handler({ path: "/docs/app/missing" }));
    expect(result.error).toBe("NOT_FOUND");
  });

  test("throws on non-404 non-200 responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("", { status: 500, statusText: "Internal" }),
        ),
    );
    await expect(handler({ path: "/docs/app/foo" })).rejects.toThrow(/500/);
  });

  test("strips trailing slash before appending .md", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("body", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await handler({ path: "/docs/app/foo/" });

    expect(fetchMock).toHaveBeenCalledWith("https://nextjs.org/docs/app/foo.md");
  });

  test("strips fragment before appending .md", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("body", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await handler({ path: "/docs/app/foo#section" });

    expect(fetchMock).toHaveBeenCalledWith("https://nextjs.org/docs/app/foo.md");
  });

  test("strips query string before appending .md", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("body", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await handler({ path: "/docs/app/foo?x=1" });

    expect(fetchMock).toHaveBeenCalledWith("https://nextjs.org/docs/app/foo.md");
  });

  test("strips YAML frontmatter from the response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("---\ntitle: x\n---\n\n# Body\nstuff", { status: 200 }),
        ),
    );
    const result = JSON.parse(await handler({ path: "/docs/app/foo" }));
    expect(result.content).toBe("# Body\nstuff");
  });
});
