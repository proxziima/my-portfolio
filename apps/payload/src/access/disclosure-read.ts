import type { Access } from 'payload'

/**
 * Anonymous REST readers (the website) only ever receive public documents; editors see all.
 * Any logged-in user, including the user behind an MCP API key, sees every tier. The twin's three custom
 * tools (twinIdentity, twinSearch, twinDisclose) add their own explicit tier filter, so they do not depend
 * on who the key's user is. The plugin's generic collection tools run as that user and get no such filter,
 * so the twin's API key must have only those three tools enabled.
 */
export const disclosureRead: Access = ({ req }) => (req.user ? true : { disclosure: { equals: 'public' } })
