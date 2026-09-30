import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, GlobalAfterChangeHook, PayloadRequest } from 'payload'

let warnedMissingConfig = false

async function notifyWeb(req: PayloadRequest): Promise<void> {
  if (req.context.disableRevalidate) return
  const { WEB_URL, REVALIDATE_SECRET } = process.env
  if (!WEB_URL || !REVALIDATE_SECRET) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true
      req.payload.logger.warn('WEB_URL or REVALIDATE_SECRET is not set; the web app will not be revalidated')
    }
    return
  }
  try {
    const res = await fetch(new URL('/api/revalidate', WEB_URL), {
      method: 'POST',
      headers: { 'x-revalidate-secret': REVALIDATE_SECRET },
      signal: AbortSignal.timeout(3000),
      redirect: 'error',
    })
    if (!res.ok) req.payload.logger.warn(`web revalidate responded ${res.status}`)
  } catch (error) {
    req.payload.logger.warn({ err: error }, 'web revalidate failed')
  }
}

type Status = { _status?: string } | null | undefined

/** Draft saves (autosave fires every few hundred ms) are invisible to the web, unless they unpublish. */
export const isDraftOnlyChange = (doc: Status, previousDoc: Status): boolean =>
  doc?._status === 'draft' && previousDoc?._status !== 'published'

export const revalidateAfterChange: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  if (!isDraftOnlyChange(doc, previousDoc)) await notifyWeb(req)
  return doc
}
export const revalidateAfterDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  await notifyWeb(req)
  return doc
}
export const revalidateGlobal: GlobalAfterChangeHook = async ({ doc, req }) => {
  await notifyWeb(req)
  return doc
}

export const revalidateCollectionHooks = {
  afterChange: [revalidateAfterChange],
  afterDelete: [revalidateAfterDelete],
}

export const revalidateGlobalHooks = { afterChange: [revalidateGlobal] }
