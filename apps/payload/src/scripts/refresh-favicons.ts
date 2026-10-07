import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { relationId } from '../fields/relation-ids'

/**
 * Re-fetches the favicon of every company and project with a URL: the backfill after the companies
 * migration (which has no network), or a refresh of stale icons. Each save runs the favicon hook with
 * `refreshFavicon`, which never fails the save and logs why when nothing is stored.
 */
const payload = await getPayload({ config: configPromise })

/** When the favicon doc was last written: a refresh replaces the file in place, keeping its id. */
const faviconStamp = async (id: number | null) =>
  id === null ? null : (await payload.findByID({ collection: 'favicons', id, depth: 0, overrideAccess: true, select: { updatedAt: true } })).updatedAt

let failed = 0
for (const collection of ['companies', 'projects'] as const) {
  const { docs } = await payload.find({ collection, where: { url: { exists: true } }, depth: 0, pagination: false, overrideAccess: true })
  for (const doc of docs) {
    if (!doc.url) continue
    // One record failing (e.g. it no longer validates) must not stop the rest of the backfill.
    try {
      const before = relationId(doc.favicon)
      const stampBefore = await faviconStamp(before)
      const saved = await payload.update({ collection, id: doc.id, data: {}, depth: 0, context: { refreshFavicon: true }, overrideAccess: true })
      const after = relationId(saved.favicon)
      const outcome =
        after === null
          ? 'no favicon found'
          : after !== before || (await faviconStamp(after)) !== stampBefore
            ? `favicon stored (favicons/${after})`
            : `unchanged (kept existing favicons/${after})`
      payload.logger.info(`${collection}/${doc.id} ${doc.url}: ${outcome}`)
    } catch (err) {
      failed++
      payload.logger.error({ err }, `${collection}/${doc.id} ${doc.url}: refresh failed`)
    }
  }
}
if (failed > 0) payload.logger.warn(`${failed} record(s) could not be refreshed; see the errors above`)
process.exit(failed > 0 ? 1 : 0)
