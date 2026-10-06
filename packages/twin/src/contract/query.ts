/**
 * Canonical form of a search query, used as the per-session cache key. Order and repetition of
 * terms don't change what the knowledge base returns, so they must not change the key.
 */
export function normalizeQuery(query: string): string {
  const terms = query
    .normalize('NFKC')
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}#+]+$/gu, ''))
    .filter((t) => t.length > 0 && /[\p{L}\p{N}]/u.test(t))
  return [...new Set(terms)].sort().join(' ')
}
