import type { CollectionBeforeChangeHook, CollectionBeforeDeleteHook, PayloadRequest } from 'payload'
import { type BrandSlug, inUse, recordName } from './guard-company-delete'

type RecordRef = { relationTo: BrandSlug; id: number | string }

const idOf = (value: unknown): unknown => (value && typeof value === 'object' ? (value as { id?: unknown }).id : value)

/**
 * Whether a Lexical value, or any node under it (lists included), holds a `recordLink` to `ref`. The
 * link's value is the record's id, or the record itself when populated.
 */
export function linksTo(node: unknown, ref: RecordRef): boolean {
  if (!node || typeof node !== 'object') return false
  const n = node as { root?: unknown; children?: unknown; type?: unknown; fields?: { blockType?: unknown; record?: { relationTo?: unknown; value?: unknown } } }
  if (n.type === 'inlineBlock' && n.fields?.blockType === 'recordLink') {
    const record = n.fields.record
    const id = idOf(record?.value)
    if (record?.relationTo === ref.relationTo && id != null && String(id) === String(ref.id)) return true
  }
  if (n.root) return linksTo(n.root, ref)
  return Array.isArray(n.children) && n.children.some((child) => linksTo(child, ref))
}

/** Titles of the disciplines whose bios link the record, whatever their own tier. */
async function linkingBios(req: PayloadRequest, ref: RecordRef): Promise<string[]> {
  const { docs } = await req.payload.find({
    collection: 'disciplines',
    depth: 0,
    overrideAccess: true,
    pagination: false,
    select: { title: true, bio: true },
    req,
  })
  return docs.filter((discipline) => linksTo(discipline.bio, ref)).map((discipline) => discipline.title)
}

const refuseLinked = (name: string, bios: string[], action: 'hiding' | 'deleting') =>
  inUse(
    name,
    bios.length === 1
      ? `linked from the bio of ${bios[0]}; remove that link before ${action} it.`
      : `linked from the bios of ${bios.join(', ')}; remove those links before ${action} it.`,
  )

/*
 * `recordLink` only accepts public records (its filterOptions), and Payload re-validates that on every
 * save of a discipline. A linked record that stopped being public, or was deleted, would make every
 * later save of the bios that link it fail. So the change is refused at its source, naming the bios.
 */

/** Refuses to take a record out of `public` while a bio links it. */
export const guardHidingLinkedRecord: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req, collection }) => {
  if (operation !== 'update' || !originalDoc) return data
  if (originalDoc.disclosure !== 'public' || data.disclosure === undefined || data.disclosure === 'public') return data

  const ref: RecordRef = { relationTo: collection.slug as BrandSlug, id: originalDoc.id }
  const bios = await linkingBios(req, ref)
  if (bios.length === 0) return data
  const name = typeof originalDoc.name === 'string' ? originalDoc.name : await recordName(req, ref.relationTo, ref.id)
  throw refuseLinked(name, bios, 'hiding')
}

/** Refuses to delete a record while a bio links it. */
export const guardDeletingLinkedRecord: CollectionBeforeDeleteHook = async ({ id, req, collection }) => {
  const ref: RecordRef = { relationTo: collection.slug as BrandSlug, id }
  const bios = await linkingBios(req, ref)
  if (bios.length === 0) return
  throw refuseLinked(await recordName(req, ref.relationTo, id), bios, 'deleting')
}
