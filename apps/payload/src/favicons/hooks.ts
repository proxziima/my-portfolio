import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, CollectionConfig, CollectionSlug, PayloadRequest } from 'payload'
import { formatSlug } from '../fields/slug'
import { discoverFavicon, type FoundFavicon } from './discover'

const idOf = (ref: unknown): number | null => {
  if (typeof ref === 'number') return ref
  if (ref && typeof ref === 'object' && typeof (ref as { id?: unknown }).id === 'number') return (ref as { id: number }).id
  return null
}

const HTTP_URL = /^https?:\/\//i

// Nested Local API calls below pass `req` (so they join its transaction) and set `req.file` on it. That is
// harmless here: Companies and Projects are not upload collections.

async function removeFavicon(req: PayloadRequest, id: number | null): Promise<void> {
  if (id === null) return
  try {
    await req.payload.delete({ collection: 'favicons', id, req, overrideAccess: true })
  } catch (err) {
    req.payload.logger.warn({ err }, `favicon ${id} could not be deleted`)
  }
}

/**
 * Writes the icon to the freshly saved owner. `createLocalReq` reassigns `req.context` on the shared
 * request, so the `skipFavicon`/`disableRevalidate` flags are put back afterwards: the outer save still
 * has to revalidate the web.
 */
async function writeOwnerFavicon(req: PayloadRequest, collection: string, id: unknown, favicon: number | null): Promise<void> {
  const outerContext = req.context
  try {
    await req.payload.update({
      collection: collection as CollectionSlug,
      id: id as number,
      data: { favicon } as never,
      req,
      context: { skipFavicon: true, disableRevalidate: true },
      depth: 0,
    })
  } finally {
    req.context = outerContext
  }
}

/** Creates the favicon doc, or replaces the file of `current` in place. Never throws. */
async function storeFavicon(
  req: PayloadRequest,
  found: FoundFavicon,
  name: string,
  current: number | null,
): Promise<{ id: number | null; currentLost: boolean }> {
  const file = { data: found.data, mimetype: found.mimetype, name: `${formatSlug(name) || 'site'}-favicon.${found.ext}`, size: found.data.length }
  try {
    const doc =
      current !== null
        ? await req.payload.update({ collection: 'favicons', id: current, data: {}, file, req, overrideAccess: true })
        : await req.payload.create({ collection: 'favicons', data: {}, file, req, overrideAccess: true })
    return { id: doc.id, currentLost: false }
  } catch (err) {
    req.payload.logger.warn({ err }, 'favicon could not be stored')
    // A failed replacement may have lost the old file, so the old doc is not worth keeping.
    if (current !== null) {
      await removeFavicon(req, current)
      return { id: null, currentLost: true }
    }
    return { id: null, currentLost: false }
  }
}

/**
 * Keeps `favicon` in step with `url` after the record is saved (so a save that fails validation leaves no
 * icon behind): fetched when the URL changes or none is stored yet, replaced in place, deleted when the URL
 * goes or nothing is found. It never fails the save. `context.skipFavicon` turns it off;
 * `context.refreshFavicon` re-fetches an unchanged URL.
 */
export const syncFavicon: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req, context, collection }) => {
  if (context.skipFavicon) return doc
  try {
    const current = idOf(doc.favicon)
    const url: string | null = typeof doc.url === 'string' ? doc.url : null
    const clear = async () => {
      await removeFavicon(req, current)
      await writeOwnerFavicon(req, collection.slug, doc.id, null)
      return { ...doc, favicon: null }
    }

    if (!url || !HTTP_URL.test(url)) return current !== null ? await clear() : doc

    const urlChanged = operation === 'create' || url !== previousDoc?.url
    if (!urlChanged && current !== null && !context.refreshFavicon) return doc

    const found = await discoverFavicon(url)
    const stored = found ? await storeFavicon(req, found, String(doc.name ?? 'site'), current) : { id: null, currentLost: false }
    if (stored.id === null) {
      req.payload.logger.warn(`no favicon stored for ${url}`)
      if (current !== null && stored.currentLost) {
        await writeOwnerFavicon(req, collection.slug, doc.id, null)
        return { ...doc, favicon: null }
      }
      return current !== null && urlChanged ? await clear() : doc
    }
    if (stored.id === current) return doc
    try {
      await writeOwnerFavicon(req, collection.slug, doc.id, stored.id)
    } catch (err) {
      await removeFavicon(req, stored.id)
      throw err
    }
    return { ...doc, favicon: stored.id }
  } catch (err) {
    req.payload.logger.warn({ err }, 'favicon sync failed; the record was saved without it')
    return doc
  }
}

export const deleteFavicon: CollectionAfterDeleteHook = async ({ doc, req }) => {
  await removeFavicon(req, idOf(doc?.favicon))
}

/**
 * Adds the favicon hooks to a collection's existing hooks. The sync runs first among `afterChange` hooks
 * so the web is revalidated (by a later hook) only once the icon is written.
 */
export const withFaviconHooks = (hooks: NonNullable<CollectionConfig['hooks']>): NonNullable<CollectionConfig['hooks']> => ({
  ...hooks,
  afterChange: [syncFavicon, ...(hooks.afterChange ?? [])],
  afterDelete: [...(hooks.afterDelete ?? []), deleteFavicon],
})
