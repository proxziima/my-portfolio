import type { CollectionSlug, Payload, Where } from 'payload'

const QUIET = { disableRevalidate: true }

export async function upsert<T extends object>(
  payload: Payload,
  collection: CollectionSlug,
  where: Where,
  data: T,
): Promise<number> {
  const found = await payload.find({ collection, where, limit: 1, depth: 0 })
  const existing = found.docs[0]
  const doc = existing
    ? await payload.update({ collection, id: existing.id, data, context: QUIET })
    : await payload.create({ collection, data, context: QUIET })
  return doc.id
}

export const quiet = QUIET
