type Ref = number | { id: number } | null | undefined

/** Numeric ids from a hasMany relationship value, whether it is populated or not. */
export const relationIds = (value: unknown): number[] =>
  Array.isArray(value)
    ? (value as Ref[])
        .map((ref) => (typeof ref === 'object' ? ref?.id : ref))
        .filter((id): id is number => typeof id === 'number')
    : []
