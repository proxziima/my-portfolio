import configPromise from '@payload-config'
import { getPayload } from 'payload'
import * as seed from './data'
import { quiet, upsert } from './upsert'

const payload = await getPayload({ config: configPromise })

const ids = new Map<string, number>()
for (const d of seed.disciplines) {
  ids.set(d.slug, await upsert(payload, 'disciplines', { slug: { equals: d.slug } }, d))
}
const rel = (slugs: string[]) =>
  slugs.map((slug) => {
    const id = ids.get(slug)
    if (id === undefined) throw new Error(`Seed references unknown discipline slug "${slug}"`)
    return id
  })

for (const e of seed.experiences) {
  await upsert(payload, 'experiences', { and: [{ company: { equals: e.company } }, { title: { equals: e.title } }] }, { ...e, disciplines: rel(e.disciplines) })
}
for (const p of seed.projects) {
  await upsert(payload, 'projects', { name: { equals: p.name } }, { ...p, disciplines: rel(p.disciplines) })
}

await payload.updateGlobal({ slug: 'profile', data: seed.profile, context: quiet })
await payload.updateGlobal({ slug: 'contact', data: { links: seed.contactLinks }, context: quiet })
await payload.updateGlobal({ slug: 'navigation', data: { items: seed.navigationItems }, context: quiet })
await payload.updateGlobal({ slug: 'site-settings', data: { defaultDiscipline: ids.get(seed.defaultDisciplineSlug) }, context: quiet })

payload.logger.info('Seed complete')
process.exit(0)
