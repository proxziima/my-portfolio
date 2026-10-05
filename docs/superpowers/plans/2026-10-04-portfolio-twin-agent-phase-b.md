# Phase B — Payload CMS (disclosure tiers, knowledge, twin MCP tools)

Part of `2026-10-04-portfolio-twin-agent.md`. Read its "Global conventions" first, especially rule 5 (never write to `apps/payload/payload.db`).

**Context:**
- Payload 3.90.2, SQLite.
- Style: single quotes, no semicolons.
- Tests are pure vitest specs under `apps/payload/tests/int/*.int.spec.ts` with no database. Keep logic in pure functions so it can be tested that way.
- `@payloadcms/plugin-mcp` 3.90.2 custom tools have this shape (from its `dist/types.d.ts`):

```ts
mcp: {
  tools: Array<{
    name: string
    description: string
    parameters: z.ZodRawShape // zod v3 (the plugin depends on zod 3.25.76)
    handler: (args: Record<string, unknown>, req: PayloadRequest, extra: unknown) =>
      | { content: Array<{ type: 'text'; text: string }>; role?: string }
      | Promise<{ content: Array<{ type: 'text'; text: string }>; role?: string }>
  }>
}
```

- Each custom tool becomes a per-API-key checkbox, `payload-mcp-tool.<camelCaseName>`, with default `true`. The twin's key must have **only** the three twin tools checked. Adding tools adds columns to `payload_mcp_api_keys`, so the migration in B4 must include them.
- `req.user` is the key's bound user.

---

### Task B1: Disclosure tier field and tier-aware read access

**Files:**
- Create: `apps/payload/src/fields/disclosure.ts`
- Create: `apps/payload/src/access/disclosure-read.ts`
- Modify: `apps/payload/src/collections/{Experiences,Projects,Content,Disciplines}.ts`
- Test: `apps/payload/tests/int/disclosure.int.spec.ts`

- [ ] **Step 1: Failing test**

`apps/payload/tests/int/disclosure.int.spec.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { disclosureRead } from '@/access/disclosure-read'
import { DISCLOSURE_TIERS, disclosureField } from '@/fields/disclosure'

const call = (user: unknown) => disclosureRead({ req: { user } } as Parameters<typeof disclosureRead>[0])

describe('disclosure tiers', () => {
  it('offers exactly public, restricted and never, defaulting to public', () => {
    expect(DISCLOSURE_TIERS).toEqual(['public', 'restricted', 'never'])
    expect(disclosureField().defaultValue).toBe('public')
  })

  it('shows anonymous readers only public documents', () => {
    expect(call(null)).toEqual({ disclosure: { equals: 'public' } })
  })

  it('shows signed-in editors everything', () => {
    expect(call({ id: 1 })).toBe(true)
  })
})
```

- [ ] **Step 2: Run.** Command: `bun run --cwd apps/payload test:int -- disclosure`. Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/payload/src/fields/disclosure.ts`:
```ts
import type { SelectField } from 'payload'

/** Who may learn a fact: anyone, only after the owner approves, or nobody (spec §10–11). */
export const DISCLOSURE_TIERS = ['public', 'restricted', 'never'] as const
export type DisclosureTier = (typeof DISCLOSURE_TIERS)[number]

/** The tier select shared by every collection the twin can read. Existing rows default to public. */
export const disclosureField = (): SelectField => ({
  name: 'disclosure',
  type: 'select',
  required: true,
  defaultValue: 'public',
  index: true,
  options: [
    { label: 'Public: the twin may share it', value: 'public' },
    { label: 'Restricted: needs my approval per conversation', value: 'restricted' },
    { label: 'Never: the twin never sees it', value: 'never' },
  ],
  admin: { position: 'sidebar' },
})
```

`apps/payload/src/access/disclosure-read.ts`:
```ts
import type { Access } from 'payload'

/**
 * Anonymous REST readers (the website) only ever receive public documents; editors see all.
 * The twin's MCP tools add their own explicit filter, so they never depend on who the key's user is.
 */
export const disclosureRead: Access = ({ req }) => (req.user ? true : { disclosure: { equals: 'public' } })
```

In each of `Experiences.ts`, `Projects.ts`, `Content.ts` and `Disciplines.ts`:
- Import `disclosureField` and `disclosureRead`.
- Change `access: publicContentAccess` to `access: { ...publicContentAccess, read: disclosureRead }`.
- Append `disclosureField()` as the last entry of `fields`.

For example, in `Projects.ts`:
```ts
import { disclosureRead } from '../access/disclosure-read'
import { disclosureField } from '../fields/disclosure'
// ...
  access: { ...publicContentAccess, read: disclosureRead },
// ...
    orderField(),
    disclosureField(),
  ],
```

- [ ] **Step 4: Run.** Command: `bun run --cwd apps/payload test:int`. Expected: all specs PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/payload/src/fields/disclosure.ts apps/payload/src/access/disclosure-read.ts apps/payload/src/collections/Experiences.ts apps/payload/src/collections/Projects.ts apps/payload/src/collections/Content.ts apps/payload/src/collections/Disciplines.ts apps/payload/tests/int/disclosure.int.spec.ts
git commit -m "feat(cms): public, restricted and never disclosure tiers on portfolio entries"
```

---

### Task B2: `knowledge` collection

**Files:**
- Create: `apps/payload/src/collections/Knowledge.ts`
- Modify: `apps/payload/src/payload.config.ts` (add to `collections`)
- Test: `apps/payload/tests/int/knowledge.int.spec.ts`

- [ ] **Step 1: Failing test**

`apps/payload/tests/int/knowledge.int.spec.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { KNOWLEDGE_CATEGORIES, Knowledge } from '@/collections/Knowledge'

const field = (name: string) => Knowledge.fields.find((f) => 'name' in f && f.name === name)

describe('knowledge collection', () => {
  it('uses the categories the agent scores on', () => {
    expect(KNOWLEDGE_CATEGORIES).toEqual(['availability', 'compensation', 'logistics', 'background', 'voice', 'other'])
  })

  it('has a disclosure tier and redact terms only meaningful for never entries', () => {
    expect(field('disclosure')).toBeDefined()
    const terms = field('redactTerms')
    expect(terms && 'admin' in terms && typeof terms.admin?.condition).toBe('function')
  })
})
```

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/payload/src/collections/Knowledge.ts`:
```ts
import type { CollectionConfig } from 'payload'
import { disclosureRead } from '../access/disclosure-read'
import { publicContentAccess } from '../access/public-read'
import { disclosureField } from '../fields/disclosure'
import { orderField } from '../fields/order'

/** Must match `KnowledgeCategory` in `@repo/twin/contract` (the agent scores restricted requests by it). */
export const KNOWLEDGE_CATEGORIES = ['availability', 'compensation', 'logistics', 'background', 'voice', 'other'] as const

/**
 * Facts for the twin that are not portfolio entries: notice period, rates policy, relocation,
 * work authorisation, preferences, and `voice` writing samples. Not rendered on the website.
 */
export const Knowledge: CollectionConfig = {
  slug: 'knowledge',
  labels: { singular: 'Knowledge entry', plural: 'Twin knowledge' },
  admin: { useAsTitle: 'topic', defaultColumns: ['topic', 'category', 'disclosure'], group: 'Twin' },
  defaultSort: 'order',
  access: { ...publicContentAccess, read: disclosureRead },
  fields: [
    { name: 'topic', type: 'text', required: true, admin: { description: 'What this answers, e.g. "Notice period".' } },
    { name: 'category', type: 'select', required: true, defaultValue: 'other', options: [...KNOWLEDGE_CATEGORIES] },
    {
      name: 'answer',
      type: 'textarea',
      required: true,
      admin: { description: 'Written in first person. For "voice", paste a real sample of your writing.' },
    },
    {
      name: 'redactTerms',
      type: 'array',
      admin: {
        description: 'Exact strings that must never appear in a twin reply (salary figures, client names, address).',
        condition: (data) => data?.disclosure === 'never',
      },
      fields: [{ name: 'term', type: 'text', required: true }],
    },
    orderField(),
    disclosureField(),
  ],
}
```

In `payload.config.ts`, import `Knowledge` and add it to `collections` after `Content`.

- [ ] **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/payload/src/collections/Knowledge.ts apps/payload/src/payload.config.ts apps/payload/tests/int/knowledge.int.spec.ts
git commit -m "feat(cms): knowledge collection for facts and writing samples the twin may use"
```

---

### Task B3: Twin MCP tools and the redact-terms endpoint

**Files:**
- Modify: `packages/twin/src/contract/index.ts`; create `packages/twin/src/contract/search.ts` (the shared wire shape)
- Create: `apps/payload/src/mcp/twin-corpus.ts` (pure: corpus building and ranking)
- Create: `apps/payload/src/mcp/twin-tools.ts` (Payload I/O and MCP handlers)
- Modify: `apps/payload/src/mcp/mcp-plugin.ts`
- Create: `apps/payload/src/endpoints/redact-terms.ts`
- Create: `apps/payload/src/security/secrets.ts`
- Modify: `apps/payload/src/payload.config.ts` (`endpoints`)
- Modify: `apps/payload/package.json` (deps: `zod` `3.25.76`, `@repo/twin` `*`)
- Test: `apps/payload/tests/int/twin-corpus.int.spec.ts`, `packages/twin/tests/contract/search.test.ts`

- [ ] **Step 1: Shared wire shape (in `@repo/twin`, TDD).**

`packages/twin/tests/contract/search.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { TwinSearchResult } from '../../src/contract/search'

describe('TwinSearchResult', () => {
  it('accepts public items and restricted stubs, nothing else', () => {
    const ok = TwinSearchResult.parse({
      items: [{ sourceId: 'projects:3', kind: 'project', title: 'Atlas', text: 'A design system', url: 'https://x.dev' }],
      restricted: [{ sourceId: 'knowledge:9', topic: 'Notice period', category: 'availability' }],
    })
    expect(ok.items).toHaveLength(1)
    expect(() => TwinSearchResult.parse({ items: [], restricted: [{ sourceId: 'knowledge:9', topic: 'x', category: 'secret' }] })).toThrow()
  })
})
```

`packages/twin/src/contract/search.ts`:
```ts
import { z } from 'zod'
import { KnowledgeCategory } from './state'

/** A public knowledge-base item, citable by `sourceId` (`<collection>:<id>` or `<global>:global`). */
export const TwinItem = z.object({
  sourceId: z.string().regex(/^[a-z-]+:[\w-]+$/),
  kind: z.enum(['profile', 'contact', 'experience', 'project', 'content', 'discipline', 'knowledge']),
  title: z.string(),
  text: z.string(),
  url: z.string().optional(),
})
export type TwinItem = z.infer<typeof TwinItem>

/** A restricted entry: only its topic leaves the CMS until the owner approves. */
export const RestrictedStub = z.object({
  sourceId: z.string().regex(/^knowledge:[\w-]+$|^[a-z-]+:[\w-]+$/),
  topic: z.string(),
  category: KnowledgeCategory.nullable(),
})
export type RestrictedStub = z.infer<typeof RestrictedStub>

/** What `twinSearch` returns over MCP. Never-tier entries are absent by construction. */
export const TwinSearchResult = z.object({ items: z.array(TwinItem), restricted: z.array(RestrictedStub) })
export type TwinSearchResult = z.infer<typeof TwinSearchResult>

/** Grounding for the identity skill: who the owner is and how they write (public tier only). */
export const TwinIdentity = z.object({
  name: z.string(),
  headline: z.string().nullable(),
  location: z.string().nullable(),
  currentRoles: z.array(z.object({ title: z.string(), company: z.string() })),
  voiceSamples: z.array(z.string()),
})
export type TwinIdentity = z.infer<typeof TwinIdentity>

/** What `twinDisclose` returns: one restricted item, now released. */
export const TwinDisclosure = z.object({ item: TwinItem })
export type TwinDisclosure = z.infer<typeof TwinDisclosure>
```

Add `export * from './search'` to `packages/twin/src/contract/index.ts`. Run `bun run --cwd packages/twin test`; expect PASS.

- [ ] **Step 2: Failing corpus test.**

`apps/payload/tests/int/twin-corpus.int.spec.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { rankCorpus, searchTerms, type CorpusEntry } from '@/mcp/twin-corpus'

const entry = (sourceId: string, title: string, text: string, disclosure: CorpusEntry['disclosure'] = 'public', category: CorpusEntry['category'] = null): CorpusEntry => ({
  item: { sourceId, kind: 'project', title, text },
  disclosure,
  category,
})

const corpus = [
  entry('projects:1', 'Atlas design system', 'React component library used across products'),
  entry('projects:2', 'Ledger', 'Go service for payments'),
  entry('knowledge:5', 'Notice period', 'Thirty days', 'restricted', 'availability'),
  entry('knowledge:6', 'Salary', 'secret', 'never', 'compensation'),
]

describe('twin corpus', () => {
  it('drops stopwords and plural endings from queries', () => {
    expect(searchTerms('What projects have you built with React?')).toEqual(['project', 'built', 'react'])
  })

  it('ranks title matches above body matches and returns public items in full', () => {
    const r = rankCorpus(corpus, 'react projects', 5)
    expect(r.items[0]?.sourceId).toBe('projects:1')
    expect(r.restricted).toEqual([])
  })

  it('returns restricted entries as stubs and never-tier entries not at all', () => {
    const r = rankCorpus(corpus, 'notice period salary', 5)
    expect(r.restricted).toEqual([{ sourceId: 'knowledge:5', topic: 'Notice period', category: 'availability' }])
    expect(JSON.stringify(r)).not.toContain('secret')
    expect(JSON.stringify(r)).not.toContain('Thirty days')
  })
})
```

- [ ] **Step 3: Run.** Expected: FAIL.

- [ ] **Step 4: Implement the pure corpus module.**

`apps/payload/src/mcp/twin-corpus.ts`:
```ts
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
```

Add a test for `lexicalText` to the same spec file:
```ts
it('flattens lexical bios', () => {
  const bio = { root: { children: [{ type: 'paragraph', children: [{ text: 'I build ' }, { text: 'tools.' }] }, { type: 'paragraph', children: [{ text: 'Second.' }] }] } }
  expect(lexicalText(bio)).toBe('I build tools.\nSecond.')
})
```
(Import `lexicalText` too.)

- [ ] **Step 5: Run.** Expected: PASS.

- [ ] **Step 6: Payload I/O and MCP handlers** (thin, so the logic stays in the tested module).

Add the dependencies to `apps/payload/package.json`: `"zod": "3.25.76"` (the same zod major the MCP plugin uses for `parameters`) and `"@repo/twin": "*"`. Then run `bun install`.

`apps/payload/src/mcp/twin-tools.ts`:
```ts
import type { Payload, PayloadRequest } from 'payload'
import { z } from 'zod'
import type { KnowledgeCategory, TwinIdentity, TwinItem } from '@repo/twin/contract'
import type { DisclosureTier } from '../fields/disclosure'
import { lexicalText, rankCorpus, type CorpusEntry } from './twin-corpus'

const NOT_NEVER = { disclosure: { not_equals: 'never' } } as const

/** Loads every non-never document the twin may search; the corpus is a few hundred docs at most. */
export async function loadCorpus(payload: Payload): Promise<CorpusEntry[]> {
  const opts = { where: NOT_NEVER, limit: 1000, depth: 0, overrideAccess: true, pagination: false } as const
  const [experiences, projects, content, disciplines, knowledge, profile, contact] = await Promise.all([
    payload.find({ collection: 'experiences', ...opts }),
    payload.find({ collection: 'projects', ...opts }),
    payload.find({ collection: 'content', ...opts }),
    payload.find({ collection: 'disciplines', ...opts }),
    payload.find({ collection: 'knowledge', ...opts }),
    payload.findGlobal({ slug: 'profile', depth: 0, overrideAccess: true }),
    payload.findGlobal({ slug: 'contact', depth: 0, overrideAccess: true }),
  ])
  const entry = (item: TwinItem, disclosure: DisclosureTier, category: KnowledgeCategory | null = null): CorpusEntry => ({ item, disclosure, category })
  return [
    entry({ sourceId: 'profile:global', kind: 'profile', title: `Profile: ${profile.name}`, text: [profile.name, profile.headlineTail, profile.location].filter(Boolean).join(' · ') }, 'public'),
    entry({ sourceId: 'contact:global', kind: 'contact', title: 'Contact links', text: (contact.links ?? []).map((l) => `${l.label}: ${l.url}`).join('\n') }, 'public'),
    ...experiences.docs.map((d) => entry({ sourceId: `experiences:${d.id}`, kind: 'experience', title: `${d.title} at ${d.company}`, text: `${d.title} at ${d.company}, ${d.startYear}–${d.endYear ?? 'present'}`, url: d.url ?? undefined }, d.disclosure)),
    ...projects.docs.map((d) => entry({ sourceId: `projects:${d.id}`, kind: 'project', title: `Project: ${d.name}`, text: d.summary, url: d.url ?? undefined }, d.disclosure)),
    ...content.docs.map((d) => entry({ sourceId: `content:${d.id}`, kind: 'content', title: `${d.kind}: ${d.title}`, text: [d.title, d.venue, d.date?.slice(0, 10)].filter(Boolean).join(' · '), url: d.url ?? undefined }, d.disclosure)),
    ...disciplines.docs.map((d) => entry({ sourceId: `disciplines:${d.id}`, kind: 'discipline', title: `Role: ${d.title}`, text: lexicalText(d.bio) }, d.disclosure)),
    ...knowledge.docs.map((d) => entry({ sourceId: `knowledge:${d.id}`, kind: 'knowledge', title: d.topic, text: d.answer }, d.disclosure, d.category)),
  ]
}

/** MCP text content carrying JSON; the agent validates it against `@repo/twin/contract`. */
const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] })

/** Public identity grounding: profile, current roles, and `voice` samples written by the owner. */
export async function loadIdentity(payload: Payload): Promise<TwinIdentity> {
  const publicOnly = { disclosure: { equals: 'public' } } as const
  const [profile, current, voice] = await Promise.all([
    payload.findGlobal({ slug: 'profile', depth: 0, overrideAccess: true }),
    payload.find({ collection: 'experiences', where: { and: [publicOnly, { endYear: { exists: false } }] }, limit: 10, depth: 0, overrideAccess: true, pagination: false }),
    payload.find({ collection: 'knowledge', where: { and: [publicOnly, { category: { equals: 'voice' } }] }, limit: 5, depth: 0, overrideAccess: true, pagination: false, sort: 'order' }),
  ])
  return {
    name: profile.name,
    headline: profile.headlineTail ?? null,
    location: profile.location ?? null,
    currentRoles: current.docs.map((d) => ({ title: d.title, company: d.company })),
    voiceSamples: voice.docs.map((d) => d.answer),
  }
}

/** The three tools the twin's API key may call; nothing else is enabled for that key. */
export const twinTools = [
  {
    name: 'twinIdentity',
    description: 'Public identity grounding for the twin: name, headline, location, current roles, writing samples.',
    parameters: {},
    handler: async (_args: Record<string, unknown>, req: PayloadRequest) => json(await loadIdentity(req.payload)),
  },
  {
    name: 'twinSearch',
    description: 'Search the owner portfolio. Public items in full, restricted items as topic stubs, never-tier items excluded.',
    parameters: { query: z.string().min(1).max(300), limit: z.number().int().min(1).max(10).default(6) },
    handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
      const { query, limit } = z.object({ query: z.string().min(1).max(300), limit: z.number().int().min(1).max(10).default(6) }).parse(args)
      return json(rankCorpus(await loadCorpus(req.payload), query, limit))
    },
  },
  {
    name: 'twinDisclose',
    description: 'Return one restricted item in full. Only called after the owner approved its disclosure.',
    parameters: { sourceId: z.string().regex(/^[a-z-]+:[\w-]+$/) },
    handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
      const { sourceId } = z.object({ sourceId: z.string().regex(/^[a-z-]+:[\w-]+$/) }).parse(args)
      const found = (await loadCorpus(req.payload)).find((e) => e.item.sourceId === sourceId && e.disclosure === 'restricted')
      if (!found) throw new Error(`No restricted item ${sourceId}`)
      return json({ item: found.item })
    },
  },
]
```

If `d.disclosure`, `d.category` or `knowledge` are not yet on the generated types, run `bun run --cwd apps/payload generate:types` first (B4 commits the result). This works because `generate:types` reads the config, not the DB.

In `apps/payload/src/mcp/mcp-plugin.ts`, register the tools and expose `knowledge` for authoring:
```ts
import { twinTools } from './twin-tools'
// inside mcpPlugin({...}):
  mcp: { tools: twinTools },
// and in collections:
    knowledge: { enabled: crud, description: 'Twin knowledge: facts and writing samples, each with a disclosure tier.' },
```

- [ ] **Step 7: Redact-terms endpoint (TDD on the pure part).**

Add to `apps/payload/tests/int/twin-corpus.int.spec.ts`:
```ts
import { redactTermsResponse } from '@/endpoints/redact-terms'

it('collects never-tier terms and allow-lists public contact values', () => {
  const r = redactTermsResponse(
    [{ redactTerms: [{ term: 'Acme Secret' }, { term: ' ' }] }, { redactTerms: null }],
    { email: 'me@site.dev' },
    [{ url: 'mailto:hello@site.dev' }, { url: 'https://github.com/x' }],
  )
  expect(r).toEqual({ terms: ['Acme Secret'], allow: ['me@site.dev', 'hello@site.dev'] })
})
```

`apps/payload/src/security/secrets.ts`:
```ts
import { createHash, timingSafeEqual } from 'node:crypto'

/** Constant-time secret comparison (hashing first equalises lengths). Mirrors apps/web. */
export function secretsMatch(given: string | null | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}
```

`apps/payload/src/endpoints/redact-terms.ts`:
```ts
import type { Endpoint } from 'payload'
import { secretsMatch } from '../security/secrets'

/** Builds the BFF's redaction rules: never-tier terms plus public contact values to keep. */
export function redactTermsResponse(
  neverEntries: ReadonlyArray<{ redactTerms?: ReadonlyArray<{ term: string }> | null }>,
  profile: { email?: string | null },
  links: ReadonlyArray<{ url?: string | null }>,
): { terms: string[]; allow: string[] } {
  const terms = neverEntries.flatMap((e) => (e.redactTerms ?? []).map((t) => t.term.trim())).filter((t) => t.length > 0)
  const mails = links.map((l) => l.url ?? '').filter((u) => u.startsWith('mailto:')).map((u) => u.slice('mailto:'.length))
  const allow = [profile.email ?? '', ...mails].filter((v) => v.length > 0)
  return { terms: [...new Set(terms)], allow: [...new Set(allow)] }
}

/** GET /api/twin/redact-terms. Only the web BFF holds TWIN_REDACT_SECRET. */
export const redactTermsEndpoint: Endpoint = {
  path: '/twin/redact-terms',
  method: 'get',
  handler: async (req) => {
    const bearer = req.headers.get('authorization')?.replace(/^Bearer /, '')
    if (!secretsMatch(bearer, process.env.TWIN_REDACT_SECRET)) return Response.json({ ok: false }, { status: 401 })
    const [never, profile, contact] = await Promise.all([
      req.payload.find({ collection: 'knowledge', where: { disclosure: { equals: 'never' } }, limit: 1000, depth: 0, overrideAccess: true, pagination: false }),
      req.payload.findGlobal({ slug: 'profile', depth: 0, overrideAccess: true }),
      req.payload.findGlobal({ slug: 'contact', depth: 0, overrideAccess: true }),
    ])
    return Response.json(redactTermsResponse(never.docs, profile, contact.links ?? []), { headers: { 'cache-control': 'no-store' } })
  },
}
```

In `payload.config.ts`, add `endpoints: [redactTermsEndpoint],` to `buildConfig({...})`. Add `TWIN_REDACT_SECRET?: string` to `apps/payload/src/environment.d.ts` (`ProcessEnv`).

- [ ] **Step 8: Run.** Command: `bun run --cwd apps/payload test:int && bun run --cwd apps/payload check-types`. Expected: PASS and clean.

- [ ] **Step 9: Commit**

```bash
git add packages/twin/src/contract/search.ts packages/twin/src/contract/index.ts packages/twin/tests/contract/search.test.ts apps/payload/src/mcp apps/payload/src/endpoints apps/payload/src/security apps/payload/src/payload.config.ts apps/payload/src/environment.d.ts apps/payload/package.json apps/payload/tests/int/twin-corpus.int.spec.ts bun.lock
git commit -m "feat(cms): twin search and disclose MCP tools plus redact-terms endpoint, tiers enforced in the CMS"
```

---

### Task B4: Messenger global, migration, types, seed

**Files:**
- Modify: `apps/payload/src/globals/Messenger.ts`
- Modify: `apps/payload/src/seed/data.ts` (drop `replies` from the messenger seed)
- Create: `apps/payload/src/migrations/<timestamp>_twin.ts` + `.json` (generated); modify `apps/payload/src/migrations/index.ts`
- Modify: `packages/cms-types/src/payload-types.ts` (generated)
- Test: `apps/payload/tests/int/messenger-labels.int.spec.ts`

- [ ] **Step 1: Failing test**

`apps/payload/tests/int/messenger-labels.int.spec.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { Messenger } from '@/globals/Messenger'

type Named = { name?: string; fields?: Named[] }
const group = (name: string) => (Messenger.fields as Named[]).find((f) => f.name === name)

describe('messenger global for the twin', () => {
  it('no longer carries scripted replies', () => {
    expect(group('contact')?.fields?.some((f) => f.name === 'replies')).toBe(false)
  })

  it('has the labels the twin conversation needs', () => {
    const names = group('labels')?.fields?.map((f) => f.name)
    for (const n of ['throttled', 'tooLong', 'ended', 'offline', 'privacy', 'deleteData', 'bookingTitle', 'yourTime', 'myTime', 'bookingNotice']) {
      expect(names).toContain(n)
    }
  })
})
```

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Edit `Messenger.ts`.**

Remove the `replies` array from `contact`. `contact.fields` becomes `person('Vinicius Queiroz')`, and the group stays as it is otherwise. Add these to `labels.fields`, after `listeningTo`:
```ts
        requiredText('throttled', "Give me a minute, I'm getting a lot of messages. Try again shortly.", 'Shown when a visitor sends too fast.'),
        requiredText('tooLong', 'That message is a bit long for me. Could you shorten it?', 'Shown when a message exceeds the length cap.'),
        requiredText('ended', "I'll stop here for this conversation. Feel free to book a call instead.", 'Shown when a conversation reaches its limits.'),
        requiredText('offline', "I can't reply right now. Try again in a little while.", 'Shown when the twin is unreachable.'),
        requiredText('privacy', 'This chat is with an AI version of me. Messages are stored for 90 days, then deleted.', 'Footer of the conversation window.'),
        requiredText('deleteData', 'Delete my data', 'Footer link that erases this visitor’s conversations.'),
        requiredText('bookingTitle', 'Schedule a call', 'Title bar of the booking dialog.'),
        requiredText('yourTime', 'Your time', 'Label before the visitor’s time zone.'),
        requiredText('myTime', 'My time', 'Label before the owner’s time zone.'),
        requiredText('bookingNotice', 'Call booked for {time}.', 'System line after a booking; {time} is the visitor’s local time.'),
```
Update the `contact` group's admin description to `'The one contact (the owner). Replies come from the twin agent.'`.

In `apps/payload/src/seed/data.ts`, remove `replies` from the messenger seed object. If a seed test asserts on replies, update it to assert that the seed has no `replies` key.

- [ ] **Step 4: Run the specs.** Expected: PASS.

- [ ] **Step 5: Generate the migration against a throwaway database** (rule 5).

```bash
mkdir -p apps/payload/.tmp
DATABASE_URL=file:./.tmp/migrate.db PAYLOAD_SECRET=migrate-only bun run --cwd apps/payload payload migrate:create twin
rm -rf apps/payload/.tmp
```

Expected: `apps/payload/src/migrations/<timestamp>_twin.ts` and `.json`, with `index.ts` updated. Inspect the SQL. It must:
- add a `disclosure` column, default `'public'`, to `experiences`, `projects`, `content` and `disciplines`
- create the `knowledge` and `knowledge_redact_terms` tables
- add `payload_mcp_api_keys` columns for `knowledge` and for the three tool toggles (`twinIdentity`, `twinSearch`, `twinDisclose`)
- drop `messenger_contact_replies`
- add the new `messenger_labels_*` columns with their defaults

If the generator produced a destructive diff of unrelated tables, the snapshot base is wrong. Stop and report.

- [ ] **Step 6: Regenerate the types.**

Run: `bun run --cwd apps/payload generate:types`
Expected: `packages/cms-types/src/payload-types.ts` gains `Knowledge`, the `disclosure` fields and the new labels, and loses `replies`.

- [ ] **Step 7: Check types, then commit.**

Run: `bun run --cwd apps/payload check-types`. Expected: clean. `apps/web` will fail type checking on `contact.replies` until D5. That is expected; do not patch web here.

```bash
git add apps/payload/src/globals/Messenger.ts apps/payload/src/seed/data.ts apps/payload/src/migrations packages/cms-types/src/payload-types.ts apps/payload/tests/int/messenger-labels.int.spec.ts
git commit -m "feat(cms): messenger labels for the twin, scripted replies removed, twin migration"
```

- [ ] **Step 8: Phase B gate.** Run `bun run --cwd apps/payload test:int && bun run --cwd apps/payload check-types`. Expected: green.
