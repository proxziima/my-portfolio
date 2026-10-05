import type { CollectionAfterDeleteHook, CollectionBeforeChangeHook, CollectionConfig, PayloadRequest } from 'payload'
import { discoverFavicon } from './discover'

const idOf = (ref: unknown): number | null => {
  if (typeof ref === 'number') return ref
  if (ref && typeof ref === 'object' && typeof (ref as { id?: unknown }).id === 'number') return (ref as { id: number }).id
  return null
}

const slugOf = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site'

async function removeFavicon(req: PayloadRequest, id: number | null): Promise<void> {
  if (id === null) return
  try {
    await req.payload.delete({ collection: 'favicons', id, req, overrideAccess: true })
  } catch (err) {
    req.payload.logger.warn({ err }, `favicon ${id} could not be deleted`)
  }
}

/**
 * Keeps `favicon` in step with `url`: fetched when the URL changes or none is stored yet, replaced in
 * place, deleted when the URL goes or nothing is found. A failed fetch never blocks the save.
 * `context.skipFavicon` turns it off; `context.refreshFavicon` re-fetches an unchanged URL.
 */
export const syncFavicon: CollectionBeforeChangeHook = async ({ data, originalDoc, req, context }) => {
  if (context.skipFavicon) return data
  const url: unknown = data.url !== undefined ? data.url : originalDoc?.url
  const previous = idOf(originalDoc?.favicon)
  if (originalDoc && url === originalDoc.url && previous !== null && !context.refreshFavicon) {
    data.favicon = previous
    return data
  }
  const found = typeof url === 'string' && url ? await discoverFavicon(url) : null
  if (!found) {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) req.payload.logger.warn(`no favicon found for ${url}`)
    data.favicon = null
    await removeFavicon(req, previous)
    return data
  }
  const name = String(data.name ?? originalDoc?.name ?? 'site')
  const file = { data: found.data, mimetype: found.mimetype, name: `${slugOf(name)}-favicon.${found.ext}`, size: found.data.length }
  const doc =
    previous !== null
      ? await req.payload.update({ collection: 'favicons', id: previous, data: {}, file, req, overrideAccess: true })
      : await req.payload.create({ collection: 'favicons', data: {}, file, req, overrideAccess: true })
  data.favicon = doc.id
  return data
}

export const deleteFavicon: CollectionAfterDeleteHook = async ({ doc, req }) => {
  await removeFavicon(req, idOf(doc?.favicon))
}

/** Adds the favicon hooks to a collection's existing hooks. */
export const withFaviconHooks = (hooks: NonNullable<CollectionConfig['hooks']>): NonNullable<CollectionConfig['hooks']> => ({
  ...hooks,
  beforeChange: [...(hooks.beforeChange ?? []), syncFavicon],
  afterDelete: [...(hooks.afterDelete ?? []), deleteFavicon],
})
