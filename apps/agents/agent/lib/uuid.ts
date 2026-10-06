/** A strict RFC 9562 UUID: version 1-8 and the 10xx variant, any case. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** True when the value is a strict UUID (see {@link UUID}). */
export function isUuid(value: string): boolean {
  return UUID.test(value)
}
