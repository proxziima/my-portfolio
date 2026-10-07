/** A company or project as a reference renders it: what a chip link needs. */
export interface Brand {
  label: string
  chip: string
  href?: string
  icon?: string
}

/** Every readable (public) company and project, keyed `relationTo:id`. */
export type Records = ReadonlyMap<string, Brand>

/** A relationship value's id, populated or not. */
const idOf = (ref: unknown): string | undefined => {
  if (typeof ref === 'number' || typeof ref === 'string') return String(ref)
  if (ref && typeof ref === 'object' && 'id' in ref) return idOf((ref as { id: unknown }).id)
  return undefined
}

/** The record a reference points at, or undefined when the site cannot read it. */
export function findRecord(records: Records, relationTo: string, ref: unknown): Brand | undefined {
  const id = idOf(ref)
  return id === undefined ? undefined : records.get(`${relationTo}:${id}`)
}
