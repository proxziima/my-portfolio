import { APIError, type PayloadRequest } from 'payload'

const SINGULAR = { companies: 'Company', projects: 'Project' } as const

/** The collections whose records others point at: experiences, projects and bio links. */
export type BrandSlug = keyof typeof SINGULAR

/** A record's name for an error message, or e.g. "Company 7" when it cannot be read. */
export const recordName = (req: PayloadRequest, collection: BrandSlug, id: number | string): Promise<string> =>
  req.payload
    .findByID({ collection, id, depth: 0, select: { name: true }, req, overrideAccess: true })
    .then((record) => record.name)
    .catch(() => `${SINGULAR[collection]} ${id}`)

/** The readable 400 for a change refused because something still uses the record: "<name> is <usage>". */
export const inUse = (name: string, usage: string): APIError => new APIError(`${name} is ${usage}`, 400)
