import { APIError, type CollectionBeforeDeleteHook, type PayloadRequest } from 'payload'

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

/**
 * `Experience.company` is required, so a foreign key on it would make deleting a used company fail with
 * a raw constraint error. Refuse with a readable message instead. Projects may lose their optional
 * company; bio links are guarded separately (see guard-linked-record.ts).
 */
export const guardCompanyDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const { totalDocs } = await req.payload.count({
    collection: 'experiences',
    where: { company: { equals: id } },
    req,
    overrideAccess: true,
  })
  if (totalDocs === 0) return

  const used = totalDocs === 1 ? '1 experience; move or delete it first.' : `${totalDocs} experiences; move or delete them first.`
  throw inUse(await recordName(req, 'companies', id), `used by ${used}`)
}
