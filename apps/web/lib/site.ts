/** The origin of an absolute http(s) URL, or null when it is missing or malformed. */
export function originOf(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null
  } catch {
    return null
  }
}

/** The public origin (no trailing slash), from runtime env; localhost in dev. Fails loudly on a malformed value. */
export function siteUrl(): string {
  const raw = process.env.SITE_URL?.trim()
  if (!raw) return 'http://localhost:3000'
  if (!originOf(raw)) throw new Error('SITE_URL must be an absolute http(s) URL')
  return raw.replace(/\/+$/, '')
}
