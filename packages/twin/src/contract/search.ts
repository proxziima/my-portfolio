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
  sourceId: z.string().regex(/^[a-z-]+:[\w-]+$/),
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
