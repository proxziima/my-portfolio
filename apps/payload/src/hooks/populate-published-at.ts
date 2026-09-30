import type { CollectionBeforeChangeHook } from 'payload'

/** Stamps `publishedAt` the first time a document is published (manually or by a scheduled job). */
export const populatePublishedAt: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  if (data._status !== 'published' || data.publishedAt) return data
  return { ...data, publishedAt: originalDoc?.publishedAt ?? new Date().toISOString() }
}
