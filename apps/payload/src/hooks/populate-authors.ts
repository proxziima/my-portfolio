import type { User } from '@repo/cms-types'
import type { CollectionAfterReadHook, PayloadRequest } from 'payload'
import { relationIds } from '../fields/relation-ids'

export type PopulatedAuthor = { id: string; name: string }
type AuthorNames = Map<number, string | null | undefined>

/** Keeps only the public part of a user. Emails and auth fields never leave the users collection. */
export const toPopulatedAuthors = (users: Pick<User, 'id' | 'name'>[]): PopulatedAuthor[] =>
  users.map(({ id, name }) => ({ id: String(id), name: name ?? '' }))

// One cache per request, so reading a list of posts queries users once per new author, not per post.
const authorNames = (req: PayloadRequest): AuthorNames => {
  const cached = req.context.authorNames
  if (cached instanceof Map) return cached as AuthorNames
  const names: AuthorNames = new Map()
  req.context.authorNames = names
  return names
}

// `users` is not publicly readable, so author names are copied into a virtual field on read.
export const populateAuthors: CollectionAfterReadHook = async ({ doc, req }) => {
  const ids = relationIds(doc?.authors)
  if (ids.length === 0) return doc
  const names = authorNames(req)
  const missing = ids.filter((id) => !names.has(id))
  if (missing.length > 0) {
    const { docs } = await req.payload.find({
      collection: 'users',
      where: { id: { in: missing } },
      select: { name: true },
      depth: 0,
      pagination: false,
      req,
    })
    for (const user of docs) names.set(user.id, user.name)
  }
  const found = ids.filter((id) => names.has(id)).map((id) => ({ id, name: names.get(id) }))
  return { ...doc, populatedAuthors: toPopulatedAuthors(found) }
}
