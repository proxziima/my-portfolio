import type { Payload, PayloadRequest, Where } from 'payload'
import { z } from 'zod'
import type { Company } from '@repo/cms-types'
import type { KnowledgeCategory, TwinIdentity, TwinItem } from '@repo/twin/contract'
import { stricterTier, type DisclosureTier } from '../fields/disclosure'
import { lexicalText, rankCorpus, type CorpusEntry, type RecordName } from './twin-corpus'

const NOT_NEVER = { disclosure: { not_equals: 'never' } } as const

/** A relationship value's id, populated or not. */
const refId = (ref: unknown): number | undefined =>
  typeof ref === 'number' ? ref : ref && typeof ref === 'object' && typeof (ref as { id?: unknown }).id === 'number' ? (ref as { id: number }).id : undefined

/** Every company with its tier, for naming and capping the rows that reference it. */
async function loadCompanies(payload: Payload, where?: Where): Promise<Map<number, Company>> {
  const found = await payload.find({ collection: 'companies', ...(where ? { where } : {}), limit: 1000, depth: 0, overrideAccess: true, pagination: false })
  return new Map(found.docs.map((c) => [c.id, c]))
}

/** Loads every non-never document the twin may search; the corpus is a few hundred docs at most. */
export async function loadCorpus(payload: Payload): Promise<CorpusEntry[]> {
  const opts = { where: NOT_NEVER, limit: 1000, depth: 0, overrideAccess: true, pagination: false } as const
  const [companies, experiences, projects, content, disciplines, knowledge, profile, contact] = await Promise.all([
    loadCompanies(payload),
    payload.find({ collection: 'experiences', ...opts }),
    payload.find({ collection: 'projects', ...opts }),
    payload.find({ collection: 'content', ...opts }),
    payload.find({ collection: 'disciplines', ...opts }),
    payload.find({ collection: 'knowledge', ...opts }),
    payload.findGlobal({ slug: 'profile', depth: 0, overrideAccess: true }),
    payload.findGlobal({ slug: 'contact', depth: 0, overrideAccess: true }),
  ])
  const entry = (item: TwinItem, disclosure: DisclosureTier, category: KnowledgeCategory | null = null): CorpusEntry => ({ item, disclosure, category })
  const companyOf = (ref: unknown) => companies.get(refId(ref) ?? -1)
  const publicProjects = new Map(projects.docs.filter((p) => p.disclosure === 'public').map((p) => [p.id, p.name]))
  // Bios are public prose: a record link is named only while its record is public.
  const recordName: RecordName = (ref) => {
    const { relationTo, value } = (ref ?? {}) as { relationTo?: unknown; value?: unknown }
    const id = refId(value) ?? -1
    if (relationTo === 'companies') {
      const c = companies.get(id)
      return c?.disclosure === 'public' ? c.name : undefined
    }
    return relationTo === 'projects' ? publicProjects.get(id) : undefined
  }
  return [
    entry({ sourceId: 'profile:global', kind: 'profile', title: `Profile: ${profile.name}`, text: [profile.name, profile.headlineTail, profile.location].filter(Boolean).join(' · ') }, 'public'),
    entry({ sourceId: 'contact:global', kind: 'contact', title: 'Contact links', text: (contact.links ?? []).map((l) => `${l.label}: ${l.url}`).join('\n') }, 'public'),
    ...experiences.docs.flatMap((d) => {
      const company = companyOf(d.company)
      if (!company) return []
      const item = { sourceId: `experiences:${d.id}`, kind: 'experience' as const, title: `${d.title} at ${company.name}`, text: `${d.title} at ${company.name}, ${d.startYear}–${d.endYear ?? 'present'}`, url: company.url ?? undefined }
      return [entry(item, stricterTier(d.disclosure, company.disclosure))]
    }),
    ...projects.docs.map((d) => {
      const company = companyOf(d.company)
      const text = company ? `${d.summary} (at ${company.name})` : d.summary
      return entry({ sourceId: `projects:${d.id}`, kind: 'project', title: `Project: ${d.name}`, text, url: d.url ?? undefined }, company ? stricterTier(d.disclosure, company.disclosure) : d.disclosure)
    }),
    ...content.docs.map((d) => entry({ sourceId: `content:${d.id}`, kind: 'content', title: `${d.kind}: ${d.title}`, text: [d.title, d.venue, d.date?.slice(0, 10)].filter(Boolean).join(' · '), url: d.url ?? undefined }, d.disclosure)),
    ...disciplines.docs.map((d) => entry({ sourceId: `disciplines:${d.id}`, kind: 'discipline', title: `Role: ${d.title}`, text: lexicalText(d.bio, recordName) }, d.disclosure)),
    ...knowledge.docs.map((d) => entry({ sourceId: `knowledge:${d.id}`, kind: 'knowledge', title: d.topic, text: d.answer }, d.disclosure, d.category)),
  ]
}

/** MCP text content carrying JSON; the agent validates it against `@repo/twin/contract`. */
const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] })

/** Public identity grounding: profile, current roles at public companies, and `voice` samples written by the owner. */
export async function loadIdentity(payload: Payload): Promise<TwinIdentity> {
  const publicOnly = { disclosure: { equals: 'public' } } as const
  const [profile, current, voice, companies] = await Promise.all([
    payload.findGlobal({ slug: 'profile', depth: 0, overrideAccess: true }),
    payload.find({ collection: 'experiences', where: { and: [publicOnly, { endYear: { exists: false } }] }, limit: 10, depth: 0, overrideAccess: true, pagination: false }),
    payload.find({ collection: 'knowledge', where: { and: [publicOnly, { category: { equals: 'voice' } }] }, limit: 5, depth: 0, overrideAccess: true, pagination: false, sort: 'order' }),
    loadCompanies(payload, publicOnly),
  ])
  return {
    name: profile.name,
    headline: profile.headlineTail ?? null,
    location: profile.location ?? null,
    currentRoles: current.docs.flatMap((d) => {
      const company = companies.get(refId(d.company) ?? -1)
      return company ? [{ title: d.title, company: company.name }] : []
    }),
    voiceSamples: voice.docs.map((d) => d.answer),
  }
}

/** The shape `@payloadcms/plugin-mcp` expects for a custom tool (zod v3 raw shape for `parameters`). */
interface TwinTool {
  name: string
  description: string
  parameters: z.ZodRawShape
  handler: (args: Record<string, unknown>, req: PayloadRequest) => Promise<ReturnType<typeof json>>
}

/** The three tools the twin's API key may call; nothing else is enabled for that key. */
export const twinTools: TwinTool[] = [
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
