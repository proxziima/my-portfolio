import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, GlobalAfterChangeHook, PayloadRequest } from 'payload'

async function notifyWeb(req: PayloadRequest): Promise<void> {
  const { WEB_URL, REVALIDATE_SECRET } = process.env
  if (!WEB_URL || !REVALIDATE_SECRET || req.context.disableRevalidate) return
  try {
    const res = await fetch(`${WEB_URL}/api/revalidate`, {
      method: 'POST',
      headers: { 'x-revalidate-secret': REVALIDATE_SECRET },
    })
    if (!res.ok) req.payload.logger.warn(`web revalidate responded ${res.status}`)
  } catch (error) {
    req.payload.logger.warn({ err: error }, 'web revalidate failed')
  }
}

export const revalidateAfterChange: CollectionAfterChangeHook = async ({ doc, req }) => {
  await notifyWeb(req)
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
