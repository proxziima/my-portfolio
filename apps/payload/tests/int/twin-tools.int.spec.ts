import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { loadCorpus, loadIdentity } from '@/mcp/twin-tools'

const link = (relationTo: string, value: unknown) => ({ type: 'inlineBlock', fields: { blockType: 'recordLink', record: { relationTo, value } } })
const bio = (...children: unknown[]) => ({ root: { children: [{ type: 'paragraph', children }] } })

const companies = [
  { id: 1, name: 'Autodoc', url: 'https://autodoc.com.br', disclosure: 'public' },
  { id: 2, name: 'Stealth Co', url: null, disclosure: 'restricted' },
  { id: 3, name: 'Hidden Corp', url: null, disclosure: 'never' },
]
const docs: Record<string, unknown[]> = {
  companies,
  experiences: [
    { id: 10, title: 'AI Engineer', company: 1, startYear: 2024, endYear: null, disclosure: 'public' },
    { id: 11, title: 'Advisor', company: 2, startYear: 2025, endYear: null, disclosure: 'public' },
    { id: 12, title: 'Consultant', company: 3, startYear: 2023, endYear: null, disclosure: 'public' },
    { id: 13, title: 'Founder', company: { ...companies[0] }, startYear: 2020, endYear: 2022, disclosure: 'public' },
    { id: 14, title: 'Orphan', company: 999, startYear: 2019, endYear: null, disclosure: 'public' },
  ],
  projects: [
    { id: 20, name: 'Sonda', summary: 'Sampler', url: null, company: 1, disclosure: 'public' },
    { id: 21, name: 'Quiet', summary: 'Prober', url: null, company: 2, disclosure: 'public' },
    { id: 22, name: 'Secret', summary: 'Vault', url: null, company: 3, disclosure: 'public' },
    { id: 23, name: 'Populated', summary: 'Ref', url: null, company: { ...companies[0] }, disclosure: 'public' },
  ],
  content: [],
  disciplines: [
    { id: 30, title: 'SE', disclosure: 'public', bio: bio(link('companies', 1), link('projects', 20)) },
    { id: 31, title: 'Linked hidden', disclosure: 'public', bio: bio({ type: 'text', text: 'At ' }, link('companies', 2), link('companies', 3), link('projects', 21)) },
    { id: 32, title: 'Populated links', disclosure: 'public', bio: bio(link('companies', { ...companies[0] }), link('projects', { id: 20 })) },
  ],
  knowledge: [],
}

type Clause = { equals?: string; not_equals?: string }

/** Evaluates `disclosure.equals` / `disclosure.not_equals` and `endYear.exists` clauses, nested in `and`, against the table above. */
const matches = (doc: { disclosure?: string; endYear?: number | null }, where: unknown): boolean => {
  const w = (where ?? {}) as { and?: unknown[]; disclosure?: Clause; endYear?: { exists?: boolean } }
  if (w.and) return w.and.every((c) => matches(doc, c))
  if (w.endYear?.exists !== undefined && (doc.endYear != null) !== w.endYear.exists) return false
  const d = w.disclosure
  if (d?.equals !== undefined && doc.disclosure !== d.equals) return false
  if (d?.not_equals !== undefined && doc.disclosure === d.not_equals) return false
  return true
}

const fakePayload = () => ({
  find: vi.fn(async ({ collection, where }: { collection: string; where?: unknown }) => ({
    docs: ((docs[collection] ?? []) as { disclosure?: string; endYear?: number | null }[]).filter((d) => matches(d, where)),
  })),
  findGlobal: vi.fn(async ({ slug }: { slug: string }) => (slug === 'profile' ? { name: 'V', headlineTail: 'x', location: null } : { links: [] })),
}) as unknown as Payload

const corpusById = async () => {
  const corpus = await loadCorpus(fakePayload())
  return { corpus, byId: new Map(corpus.map((e) => [e.item.sourceId, e])) }
}

describe('twin tools', () => {
  it('names a public company in its experiences and keeps their tier', async () => {
    const { byId } = await corpusById()
    expect(byId.get('experiences:10')).toMatchObject({ disclosure: 'public', item: { title: 'AI Engineer at Autodoc', url: 'https://autodoc.com.br' } })
  })
  it('hides a restricted company from the title and keeps its name in the text only', async () => {
    const { byId } = await corpusById()
    const e = byId.get('experiences:11')
    expect(e?.disclosure).toBe('restricted')
    expect(e?.item.title).toBe('Advisor (company undisclosed)')
    expect(e?.item.text).toBe('Advisor at Stealth Co, 2025–present')
  })
  it('drops an experience at a never company and one whose company is unresolved', async () => {
    const { byId } = await corpusById()
    expect(byId.has('experiences:12')).toBe(false)
    expect(byId.has('experiences:14')).toBe(false)
  })
  it('resolves populated company references', async () => {
    const { byId } = await corpusById()
    expect(byId.get('experiences:13')?.item.title).toBe('Founder at Autodoc')
    expect(byId.get('projects:23')?.item.text).toBe('Ref (at Autodoc)')
  })
  it('keeps a project public and names only a public company in its text', async () => {
    const { byId } = await corpusById()
    expect(byId.get('projects:20')).toMatchObject({ disclosure: 'public', item: { text: 'Sampler (at Autodoc)' } })
    expect(byId.get('projects:21')).toMatchObject({ disclosure: 'public', item: { text: 'Prober' } })
    expect(byId.get('projects:22')).toMatchObject({ disclosure: 'public', item: { text: 'Vault' } })
  })
  it('names only public records in bios', async () => {
    const { byId } = await corpusById()
    expect(byId.get('disciplines:30')?.item.text).toBe('AutodocSonda')
    expect(byId.get('disciplines:31')?.item.text).toBe('At Quiet')
    expect(byId.get('disciplines:32')?.item.text).toBe('AutodocSonda')
  })
  it('never lets a never-tier company reach the corpus', async () => {
    const { corpus } = await corpusById()
    expect(JSON.stringify(corpus)).not.toContain('Hidden Corp')
    expect(corpus.every((e) => e.disclosure !== 'never')).toBe(true)
  })
  it('lists only current roles at public companies in the identity', async () => {
    const identity = await loadIdentity(fakePayload())
    expect(identity.currentRoles).toEqual([{ title: 'AI Engineer', company: 'Autodoc' }])
  })
})
