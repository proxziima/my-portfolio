import type { KnowledgeCategory, TwinItem, TwinSearchResult } from '@repo/twin/contract'
import type { DisclosureTier } from '../fields/disclosure'

/** One searchable document with its tier; tiers decide what leaves the CMS. */
export interface CorpusEntry {
  item: TwinItem
  disclosure: DisclosureTier
  category: KnowledgeCategory | null
}

// Words that carry no retrieval signal in the questions visitors ask (EN + PT), fillers included.
const STOPWORDS = new Set(
  'a an and are as at be been by can could did do does for from had has have how i in is it its me my of on or our so that the their them they this to was we were what when where which who why will with would you your o os um uma de da do das dos e em no na nos nas para por com que qual quais como seu sua voce você tell about more please mais sobre fale fala conte'.split(' '),
)

/** Lower-cased, de-pluralised words of a text; queries and documents go through the same steps. */
function words(text: string): string[] {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}#+.]+/u)
    .map((w) => w.replace(/^\.+|\.+$/g, ''))
    .filter((w) => w.length > 1)
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
}

/** Lower-cased, de-pluralised content words of a query. */
export function searchTerms(query: string): string[] {
  return [...new Set(words(query).filter((w) => !STOPWORDS.has(w)))]
}

/**
 * Scores one entry by whole words (a substring would let "mai", from "mais", match "mailto"): a
 * title hit is worth three body hits. Restricted entries match on their title (the topic) only, so
 * a visitor cannot probe the hidden body with guessed values.
 */
function score(entry: CorpusEntry, terms: readonly string[]): number {
  const title = new Set(words(entry.item.title))
  if (entry.disclosure === 'restricted') return terms.reduce((sum, t) => sum + (title.has(t) ? 3 : 0), 0)
  const body = new Set(words(entry.item.text))
  return terms.reduce((sum, t) => sum + (title.has(t) ? 3 : 0) + (body.has(t) ? 1 : 0), 0)
}

// What a broad question ("tell me about your background") is answered from when no word matches.
const OVERVIEW_KINDS: readonly TwinItem['kind'][] = ['profile', 'discipline', 'experience']

/**
 * A general overview for a query nothing matched: the profile, then roles, then experience, all
 * public. Matching is lexical, so broad or translated questions often share no word with the
 * content; without this the twin would claim to know nothing about itself.
 */
function overview(corpus: readonly CorpusEntry[], limit: number): TwinSearchResult {
  const items = OVERVIEW_KINDS.flatMap((kind) =>
    corpus.filter((e) => e.disclosure === 'public' && e.item.kind === kind).map((e) => e.item),
  ).slice(0, limit)
  return { items, restricted: [], overview: true }
}

/**
 * Ranks the corpus for a query. Public entries return in full, restricted entries as topic-only
 * stubs, never-tier entries not at all, whatever the caller asked. A query nothing matches gets
 * the public overview instead.
 */
export function rankCorpus(corpus: readonly CorpusEntry[], query: string, limit: number): TwinSearchResult {
  const terms = searchTerms(query)
  const ranked = corpus
    .filter((e) => e.disclosure !== 'never')
    .map((e) => ({ e, s: score(e, terms) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
  if (ranked.length === 0) return overview(corpus, limit)
  return {
    items: ranked.filter((r) => r.e.disclosure === 'public').map((r) => r.e.item),
    restricted: ranked
      .filter((r) => r.e.disclosure === 'restricted')
      .map((r) => ({ sourceId: r.e.item.sourceId, topic: r.e.item.title, category: r.e.category })),
  }
}

/** A record link's name, or undefined when the record may not be named (not public, or gone). */
export type RecordName = (ref: unknown) => string | undefined

/**
 * Plain text of a Lexical rich-text value (discipline bios), paragraphs separated by newlines. Record
 * links read their name through `recordName`; without one, or when it returns nothing, they read as
 * nothing.
 */
export function lexicalText(value: unknown, recordName: RecordName = () => undefined): string {
  const walk = (node: unknown): string => {
    if (!node || typeof node !== 'object') return ''
    const n = node as { text?: unknown; children?: unknown[]; type?: unknown; fields?: { blockType?: unknown; record?: unknown; label?: unknown; word?: unknown } }
    if (typeof n.text === 'string') return n.text
    if (n.type === 'inlineBlock') {
      if (n.fields?.blockType === 'recordLink') return recordName(n.fields.record) ?? ''
      // Free-text chip links and the curious toggle carry their words in their fields.
      const name = n.fields?.label ?? n.fields?.word
      return typeof name === 'string' ? name : ''
    }
    const inner = (n.children ?? []).map(walk).join('')
    return n.type === 'paragraph' ? `${inner}\n` : inner
  }
  return walk((value as { root?: unknown } | null)?.root).trim()
}
