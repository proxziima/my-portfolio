import type { User } from '@repo/cms-types'
import type { CollectionAfterReadHook } from 'payload'
import { relationIds } from '../fields/relation-ids'

export type PopulatedAuthor = { id: string; name: string }

/** Keeps only the public part of a user. Emails and auth fields never leave the users collection. */
export const toPopulatedAuthors = (users: Pick<User, 'id' | 'name'>[]): PopulatedAuthor[] =>
  users.map(({ id, name }) => ({ id: String(id), name: name ?? '' }))

// `users` is not publicly readable, so author names are copied into a virtual field on read.
export const populateAuthors: CollectionAfterReadHook = async ({ doc, req }) => {
  const ids = relationIds(doc?.authors)
  if (ids.length === 0) return doc
  const { docs } = await req.payload.find({
    collection: 'users',
    where: { id: { in: ids } },
    select: { name: true },
    depth: 0,
    limit: ids.length,
    pagination: false,
    req,
  })
  const byId = new Map(docs.map((user) => [user.id, user]))
  const ordered = ids.map((id) => byId.get(id)).filter((user) => user !== undefined)
  return { ...doc, populatedAuthors: toPopulatedAuthors(ordered) }
}
