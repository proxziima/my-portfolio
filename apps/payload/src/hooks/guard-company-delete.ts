import type { CollectionBeforeDeleteHook } from 'payload'
import { inUse, recordName } from './record-usage'

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
