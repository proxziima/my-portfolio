import configPromise from '@payload-config'
import { getPayload } from 'payload'

/**
 * Re-fetches the favicon of every company and project with a URL: the backfill after the companies
 * migration (which has no network), or a refresh of stale icons. Each save runs the favicon hook with
 * `refreshFavicon`, which never fails the save and logs why when nothing is stored.
 */
const payload = await getPayload({ config: configPromise })
for (const collection of ['companies', 'projects'] as const) {
  const { docs } = await payload.find({ collection, where: { url: { exists: true } }, limit: 1000, depth: 0, pagination: false, overrideAccess: true })
  for (const doc of docs) {
    if (!doc.url) continue
    const saved = await payload.update({ collection, id: doc.id, data: {}, depth: 0, context: { refreshFavicon: true }, overrideAccess: true })
    // The hook hands back the favicon it wrote; read the record again if a later hook dropped it.
    const favicon = 'favicon' in saved ? saved.favicon : (await payload.findByID({ collection, id: doc.id, depth: 0, overrideAccess: true })).favicon
    payload.logger.info(`${collection}/${doc.id} ${doc.url}: ${favicon ? `favicon stored (favicons/${typeof favicon === 'object' ? favicon.id : favicon})` : 'no favicon found'}`)
  }
}
process.exit(0)
