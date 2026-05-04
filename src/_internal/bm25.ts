// Standard BM25 ranking. Pure, deterministic, zero deps. Used by the
// docs_search tool to rank index entries by relevance to a query.
//
// Tokenization: lowercase + split on /[\W_]+/ (whitespace, punctuation,
// underscores all delimit). Suitable for short title+description rows.
//
// Parameters (k1 = 1.5, b = 0.75) are conventional defaults. We don't
// expose them today because no caller needs to tune them; if that
// changes, accept an options object.

const K1 = 1.5;
const B = 0.75;

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[\W_]+/)
    .filter((t) => t.length > 0);
}

export function bm25(docs: ReadonlyArray<string>, query: string): number[] {
  if (docs.length === 0) return [];
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return docs.map(() => 0);

  const tokenized = docs.map(tokenize);
  const docLengths = tokenized.map((d) => d.length);
  const avgDocLength =
    docLengths.reduce((sum, len) => sum + len, 0) / docs.length;

  // Term frequency per doc: Map<term, count>
  const termFreqs = tokenized.map((tokens) => {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    return tf;
  });

  // IDF per query term: log(((N - df + 0.5) / (df + 0.5)) + 1).
  // The "+1" is the BM25+ adjustment that keeps IDF non-negative even
  // when a term appears in more than half the corpus.
  const N = docs.length;
  const idf = new Map<string, number>();
  for (const term of new Set(queryTerms)) {
    let df = 0;
    for (const tf of termFreqs) if (tf.has(term)) df++;
    idf.set(term, Math.log((N - df + 0.5) / (df + 0.5) + 1));
  }

  return tokenized.map((_tokens, i) => {
    const tf = termFreqs[i];
    const dl = docLengths[i];
    let score = 0;
    for (const term of queryTerms) {
      const f = tf.get(term);
      if (!f) continue;
      const termIdf = idf.get(term) ?? 0;
      const numerator = f * (K1 + 1);
      const denominator = f + K1 * (1 - B + B * (dl / avgDocLength));
      score += termIdf * (numerator / denominator);
    }
    return score;
  });
}
