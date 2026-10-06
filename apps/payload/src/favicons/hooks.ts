import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, CollectionConfig, CollectionSlug, PayloadRequest } from 'payload'
import { discoverFavicon, type FoundFavicon } from './discover'

const idOf = (ref: unknown): number | null => {
  if (typeof ref === 'number') return ref
  if (ref && typeof ref === 'object' && typeof (ref as { id?: unknown }).id === 'number') return (ref as { id: number }).id
  return null
}

const HTTP_URL = /^https?:\/\//i

// Nested Local API calls below pass `req` so they share it (the SQLite adapter has no transactions, so
// each write commits on its own) and set `req.file` on it. That is harmless here: Companies and Projects
// are not upload collections. Every call passes `overrideAccess: true`: the `favicons` collection refuses
// all API writes, and the owner's `favicon` field refuses them too.

/**
 * Runs a Local API call that passes `req`. `createLocalReq` reassigns `req.context` on the shared request,
 * so the original context is put back afterwards: the outer save's later hooks must not see the flags set
 * for the nested call.
 */
async function withOwnContext<T>(req: PayloadRequest, fn: () => Promise<T>): Promise<T> {
  const outerContext = req.context
  try {
    return await fn()
  } finally {
    req.context = outerContext
  }
}

async function removeFavicon(req: PayloadRequest, id: number | null): Promise<void> {
  if (id === null) return
  try {
    await req.payload.delete({ collection: 'favicons', id, req, overrideAccess: true })
  } catch (err) {
    req.payload.logger.warn({ err }, `favicon ${id} could not be deleted`)
  }
}

/** Writes the icon to the freshly saved owner. The outer save still has to revalidate the web afterwards. */
const writeOwnerFavicon = (req: PayloadRequest, collection: string, id: unknown, favicon: number | null): Promise<unknown> =>
  withOwnContext(req, () =>
    req.payload.update({
      collection: collection as CollectionSlug,
      id: id as number,
      data: { favicon },
      req,
      context: { skipFavicon: true, disableRevalidate: true },
      depth: 0,
      overrideAccess: true,
    }),
  )

/**
 * The saved `doc` is the afterRead result trimmed by the caller's `select` (the MCP update tool takes
 * one), so a field missing from it is unknown, not empty. Read the stored values when any is missing.
 */
async function storedFields(
  req: PayloadRequest,
  collection: string,
  doc: Record<string, unknown>,
): Promise<{ url: unknown; favicon: unknown }> {
  if ('url' in doc && 'favicon' in doc) return doc as { url: unknown; favicon: unknown }
  return (await withOwnContext(req, () =>
    req.payload.findByID({
      collection: collection as CollectionSlug,
      id: doc.id as number,
      depth: 0,
      req,
      select: { url: true, favicon: true },
      overrideAccess: true,
    }),
  )) as { url: unknown; favicon: unknown }
}

/**
 * Creates the favicon doc, or replaces the file of `current` in place. Never throws. The file is served
 * from a public URL, so its name says only whose icon it is by collection and id (`companies-3-favicon.png`),
 * never the record's name: a hidden company must not be readable from a file name.
 */
async function storeFavicon(
  req: PayloadRequest,
  found: FoundFavicon,
  owner: string,
  current: number | null,
): Promise<{ id: number | null; currentLost: boolean }> {
  const file = { data: found.data, mimetype: found.mimetype, name: `${owner}-favicon.${found.ext}`, size: found.data.length }
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
    const owner = await storedFields(req, collection.slug, doc)
    const current = idOf(owner.favicon)
    const url: string | null = typeof owner.url === 'string' ? owner.url : null
    const clear = async () => {
      await removeFavicon(req, current)
      await writeOwnerFavicon(req, collection.slug, doc.id, null)
      return { ...doc, favicon: null }
    }

    if (!url || !HTTP_URL.test(url)) return current !== null ? await clear() : doc

    const urlChanged = operation === 'create' || url !== previousDoc?.url
    if (!urlChanged && current !== null && !context.refreshFavicon) return doc

    const found = await discoverFavicon(url)
    const stored = found ? await storeFavicon(req, found, `${collection.slug}-${doc.id}`, current) : { id: null, currentLost: false }
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
