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

/**
 * True for admin autosaves (`PATCH …?autosave=true`, every few hundred ms while typing). They only
 * write a draft version the web never shows. Payload's parseParams turns the flag into a boolean in place.
 */
export const isAutosave = (req: Pick<PayloadRequest, 'query'>): boolean => {
  const flag: unknown = req.query?.autosave
  return flag === true || flag === 'true'
}

// Every other write revalidates, including unpublish (whose doc and previousDoc can both be drafts).
export const revalidateAfterChange: CollectionAfterChangeHook = async ({ doc, req }) => {
  if (!isAutosave(req)) await notifyWeb(req)
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
