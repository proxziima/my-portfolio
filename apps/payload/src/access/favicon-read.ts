import type { Access } from 'payload'

const OWNERS = ['companies', 'projects'] as const

const idOf = (ref: unknown): number | null => {
  if (typeof ref === 'number') return ref
  if (ref && typeof ref === 'object' && typeof (ref as { id?: unknown }).id === 'number') return (ref as { id: number }).id
  return null
}

/**
 * Editors read every favicon. Anonymous readers get only the favicons of public companies and projects,
 * so a hidden record's icon (which could identify it) is neither listed at `/api/favicons` nor served at
 * `/api/favicons/file/:filename`: Payload's static file handler (`checkFileAccess`) adds the returned
 * Where to its lookup of the file's document and answers 403 when nothing matches.
 *
 * `false` (no access) when no public record has a favicon: an empty `in` list is not a reliable query.
 */
export const faviconRead: Access = async ({ req }) => {
  if (req.user) return true
  const found = await Promise.all(
    OWNERS.map((collection) =>
      req.payload.find({
        collection,
        where: { and: [{ disclosure: { equals: 'public' } }, { favicon: { exists: true } }] },
        depth: 0,
        overrideAccess: true,
        pagination: false,
        select: { favicon: true },
        req,
      }),
    ),
  )
  const ids = found.flatMap(({ docs }) => docs.map((doc) => idOf(doc.favicon))).filter((id): id is number => id !== null)
  return ids.length > 0 ? { id: { in: ids } } : false
}
