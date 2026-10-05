import configPromise from '@payload-config'
import { getPayload } from 'payload'

/**
 * Re-fetches the favicon of every company and project with a URL: the backfill after the companies
 * migration (which has no network), or a refresh of stale icons. Each save runs the favicon hook with
 * `refreshFavicon`, which never fails the save and logs why when nothing is stored.
 */
const payload = await getPayload({ config: configPromise })

const idOf = (ref: unknown): number | null =>
  typeof ref === 'number' ? ref : ref && typeof ref === 'object' && 'id' in ref ? Number((ref as { id: unknown }).id) : null

/** When the favicon doc was last written: a refresh replaces the file in place, keeping its id. */
const faviconStamp = async (id: number | null) =>
  id === null ? null : (await payload.findByID({ collection: 'favicons', id, depth: 0, overrideAccess: true, select: { updatedAt: true } })).updatedAt

for (const collection of ['companies', 'projects'] as const) {
  const { docs } = await payload.find({ collection, where: { url: { exists: true } }, depth: 0, pagination: false, overrideAccess: true })
  for (const doc of docs) {
    if (!doc.url) continue
    const before = idOf(doc.favicon)
    const stampBefore = await faviconStamp(before)
    const saved = await payload.update({ collection, id: doc.id, data: {}, depth: 0, context: { refreshFavicon: true }, overrideAccess: true })
    const after = idOf(saved.favicon)
    const outcome =
      after === null
        ? 'no favicon found'
        : after !== before || (await faviconStamp(after)) !== stampBefore
          ? `favicon stored (favicons/${after})`
          : `unchanged (kept existing favicons/${after})`
    payload.logger.info(`${collection}/${doc.id} ${doc.url}: ${outcome}`)
  }
}
process.exit(0)
