import type { KnowledgeCategory, TwinItem, TwinSearchResult } from '@repo/twin/contract'
import type { DisclosureTier } from '../fields/disclosure'

/** One searchable document with its tier; tiers decide what leaves the CMS. */
export interface CorpusEntry {
  item: TwinItem
  disclosure: DisclosureTier
  category: KnowledgeCategory | null
}

// Words that carry no retrieval signal in the questions visitors ask (EN + PT).
const STOPWORDS = new Set(
  'a an and are as at be been by can could did do does for from had has have how i in is it its me my of on or our so that the their them they this to was we were what when where which who why will with would you your o os um uma de da do das dos e em no na nos nas para por com que qual quais como seu sua voce você'.split(' '),
)

/** Lower-cased, de-pluralised content words of a query. */
export function searchTerms(query: string): string[] {
  const words = query
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}#+.]+/u)
    .map((w) => w.replace(/^\.+|\.+$/g, ''))
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
  return [...new Set(words)]
}

/** Scores one entry: a title hit is worth three body hits. */
function score(entry: CorpusEntry, terms: readonly string[]): number {
  const title = entry.item.title.toLowerCase()
  const body = entry.item.text.toLowerCase()
  return terms.reduce((sum, t) => sum + (title.includes(t) ? 3 : 0) + (body.includes(t) ? 1 : 0), 0)
}

/**
 * Ranks the corpus for a query. Public entries return in full, restricted entries as topic-only
 * stubs, never-tier entries not at all, whatever the caller asked.
 */
export function rankCorpus(corpus: readonly CorpusEntry[], query: string, limit: number): TwinSearchResult {
  const terms = searchTerms(query)
  const ranked = corpus
    .filter((e) => e.disclosure !== 'never')
    .map((e) => ({ e, s: score(e, terms) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
  return {
    items: ranked.filter((r) => r.e.disclosure === 'public').map((r) => r.e.item),
    restricted: ranked
      .filter((r) => r.e.disclosure === 'restricted')
      .map((r) => ({ sourceId: r.e.item.sourceId, topic: r.e.item.title, category: r.e.category })),
  }
}

/** Plain text of a Lexical rich-text value (discipline bios), paragraphs separated by newlines. */
export function lexicalText(value: unknown): string {
  const walk = (node: unknown): string => {
    if (!node || typeof node !== 'object') return ''
    const n = node as { text?: unknown; children?: unknown[]; type?: unknown }
    if (typeof n.text === 'string') return n.text
    const inner = (n.children ?? []).map(walk).join('')
    return n.type === 'paragraph' ? `${inner}\n` : inner
  }
  return walk((value as { root?: unknown } | null)?.root).trim()
}
