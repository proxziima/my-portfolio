import type { Access } from 'payload'

/** Signed-in users read everything (drafts included); the public only reads published documents. */
export const publishedOrAuthenticated: Access = ({ req }) =>
  req.user ? true : { _status: { equals: 'published' } }
