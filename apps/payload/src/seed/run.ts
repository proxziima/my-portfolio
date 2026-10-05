import configPromise from '@payload-config'
import { getPayload } from 'payload'
import * as seed from './data'
import { richText, type RecordCollection } from './lexical'
import { quiet, upsert } from './upsert'

const payload = await getPayload({ config: configPromise })

const companyIds = new Map<string, number>()
for (const c of seed.companies) {
  companyIds.set(c.name, await upsert(payload, 'companies', { name: { equals: c.name } }, c))
}
const projectIds = new Map<string, number>()
const resolve = (relationTo: RecordCollection, name: string) => (relationTo === 'companies' ? companyIds : projectIds).get(name)
const companyId = (name: string) => {
  const id = companyIds.get(name)
  if (id === undefined) throw new Error(`Seed references unknown company "${name}"`)
  return id
}

// Bios link projects and projects belong to disciplines: the first pass writes project links as plain
// text on a fresh DB, the last pass rewrites the bios once every project has an id.
const ids = new Map<string, number>()
for (const d of seed.disciplines) {
  ids.set(d.slug, await upsert(payload, 'disciplines', { slug: { equals: d.slug } }, { ...d, bio: richText(d.bio, resolve) }))
}
const rel = (slugs: string[]) =>
  slugs.map((slug) => {
    const id = ids.get(slug)
    if (id === undefined) throw new Error(`Seed references unknown discipline slug "${slug}"`)
    return id
  })

for (const e of seed.experiences) {
  const company = companyId(e.company)
  await upsert(payload, 'experiences', { and: [{ company: { equals: company } }, { title: { equals: e.title } }] }, { ...e, company, disciplines: rel(e.disciplines) })
}
for (const p of seed.projects) {
  const data = { ...p, company: p.company ? companyId(p.company) : undefined, disciplines: rel(p.disciplines) }
  projectIds.set(p.name, await upsert(payload, 'projects', { name: { equals: p.name } }, data))
}
for (const d of seed.disciplines) {
  await upsert(payload, 'disciplines', { slug: { equals: d.slug } }, { bio: richText(d.bio, resolve) })
}

await payload.updateGlobal({ slug: 'profile', data: seed.profile, context: quiet })
await payload.updateGlobal({ slug: 'contact', data: { links: seed.contactLinks }, context: quiet })
await payload.updateGlobal({ slug: 'navigation', data: { items: seed.navigationItems }, context: quiet })
await payload.updateGlobal({ slug: 'site-settings', data: { defaultDiscipline: ids.get(seed.defaultDisciplineSlug) }, context: quiet })
await payload.updateGlobal({ slug: 'messenger', data: seed.messenger, context: quiet })

payload.logger.info('Seed complete')
process.exit(0)
