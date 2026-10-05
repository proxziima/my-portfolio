import { APIError, type CollectionBeforeDeleteHook } from 'payload'

/**
 * `Experience.company` is required, so a foreign key on it would make deleting a used company fail with
 * a raw constraint error. Refuse with a readable message instead. Projects may lose their optional
 * company, and bio links to a missing record are dropped by the web and the twin, so only experiences count.
 */
export const guardCompanyDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const { totalDocs } = await req.payload.count({
    collection: 'experiences',
    where: { company: { equals: id } },
    req,
    overrideAccess: true,
  })
  if (totalDocs === 0) return

  const name = await req.payload
    .findByID({ collection: 'companies', id, depth: 0, select: { name: true }, req, overrideAccess: true })
    .then((company) => company.name)
    .catch(() => `Company ${id}`)
  const used = totalDocs === 1 ? '1 experience; move or delete it first.' : `${totalDocs} experiences; move or delete them first.`
  throw new APIError(`${name} is used by ${used}`, 400)
}
