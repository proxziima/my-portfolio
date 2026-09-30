/**
 * The role to restore before first paint: the URL hash wins over the stored
 * value, and either one only counts if it names a known slug.
 */
export function resolveInitialSlug(hash: string, stored: string | null, slugs: string[]): string | null {
  const fromHash = hash.startsWith('#') ? hash.slice(1) : hash
  if (slugs.includes(fromHash)) return fromHash
  if (stored !== null && slugs.includes(stored)) return stored
  return null
}
