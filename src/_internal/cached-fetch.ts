const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface CachedTextResourceOptions {
  url: string;
  sourceLabel: string;
  transform?: (raw: string) => string;
  ttlMs?: number;
}

export function createCachedTextResource(
  options: CachedTextResourceOptions,
): () => Promise<string> {
  const ttl = options.ttlMs ?? DEFAULT_CACHE_TTL_MS;
  let cached: string | null = null;
  let cachedAt = 0;

  return async function handler(): Promise<string> {
    const now = Date.now();
    if (cached && now - cachedAt < ttl) {
      return cached;
    }

    try {
      const response = await fetch(options.url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const raw = await response.text();
      const content = options.transform ? options.transform(raw) : raw;
      cached = content;
      cachedAt = now;
      return content;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (cached) {
        return `Warning: Failed to fetch fresh index from ${options.sourceLabel} (${message}). Returning cached content.\n\n${cached}`;
      }
      return `Error: Failed to fetch ${options.sourceLabel}\n\nError: ${message}\n\nPlease check your internet connection or try again later.`;
    }
  };
}
