/** The numeric id of a relationship value, whether it is populated or not; `null` when it has none. */
export const relationId = (ref: unknown): number | null => {
  const id = typeof ref === 'object' ? (ref as { id?: unknown } | null)?.id : ref
  return typeof id === 'number' ? id : null
}

/** Numeric ids from a hasMany relationship value, whether it is populated or not. */
export const relationIds = (value: unknown): number[] =>
  Array.isArray(value) ? value.map(relationId).filter((id): id is number => id !== null) : []
