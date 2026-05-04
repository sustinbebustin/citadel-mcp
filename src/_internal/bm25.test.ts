import { describe, expect, test } from "vitest";
import { bm25 } from "./bm25.js";

describe("bm25", () => {
  test("ranks documents containing all query terms above partial matches", () => {
    const docs = [
      "Caching strategies in Next.js",
      "Routing in Next.js",
      "Caching in React",
    ];
    const scores = bm25(docs, "next caching");
    const ranked = docs
      .map((d, i) => ({ d, s: scores[i] }))
      .sort((a, b) => b.s - a.s);
    expect(ranked[0].d).toBe("Caching strategies in Next.js");
  });

  test("returns score 0 for documents with no query terms", () => {
    const docs = ["apple pie", "banana bread"];
    const scores = bm25(docs, "kiwi");
    expect(scores).toEqual([0, 0]);
  });

  test("returns parallel array (one score per document)", () => {
    const docs = ["a", "b", "c"];
    expect(bm25(docs, "a")).toHaveLength(3);
  });

  test("is case-insensitive on both query and corpus", () => {
    const docs = ["Caching In React"];
    const scores = bm25(docs, "CACHING");
    expect(scores[0]).toBeGreaterThan(0);
  });

  test("tokenizer splits on punctuation, whitespace, and underscores", () => {
    const docs = ["next.js caching_strategies in (production)"];
    expect(bm25(docs, "next")[0]).toBeGreaterThan(0);
    expect(bm25(docs, "js")[0]).toBeGreaterThan(0);
    expect(bm25(docs, "strategies")[0]).toBeGreaterThan(0);
    expect(bm25(docs, "production")[0]).toBeGreaterThan(0);
  });

  test("returns empty array on empty corpus", () => {
    expect(bm25([], "anything")).toEqual([]);
  });

  test("returns all-zero scores for empty query", () => {
    expect(bm25(["a", "b"], "")).toEqual([0, 0]);
    expect(bm25(["a", "b"], "   ")).toEqual([0, 0]);
  });

  test("identical documents receive identical scores", () => {
    const docs = ["caching in react", "caching in react"];
    const scores = bm25(docs, "caching");
    expect(scores[0]).toBe(scores[1]);
  });

  test("rare terms outweigh common ones (idf works)", () => {
    const docs = [
      "the quick brown fox",
      "the lazy dog",
      "the bright sun",
      "fox in the hat",
    ];
    // "fox" appears in 2 of 4 docs, "the" appears in 4 of 4.
    // Doc 0 has both terms; doc 3 has only "fox" + "the". For a single
    // query "fox the", the rare term should dominate ranking — both docs
    // tie on "the" but doc 0 also has the rare-ish "quick brown" filler
    // making length normalization push ranking around. Easier: check
    // that "fox" alone > "the" alone for any doc that has both.
    const scoreFox = bm25(docs, "fox")[0];
    const scoreThe = bm25(docs, "the")[0];
    expect(scoreFox).toBeGreaterThan(scoreThe);
  });
});
