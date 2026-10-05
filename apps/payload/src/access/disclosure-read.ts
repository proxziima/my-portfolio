import type { Access } from 'payload'

/**
 * Anonymous REST readers (the website) only ever receive public documents; editors see all.
 * The twin's MCP tools add their own explicit filter, so they never depend on who the key's user is.
 */
export const disclosureRead: Access = ({ req }) => (req.user ? true : { disclosure: { equals: 'public' } })
