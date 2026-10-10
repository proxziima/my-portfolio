/** The public origin (no trailing slash), from runtime env; localhost in dev. */
export function siteUrl(): string {
  const raw = process.env.SITE_URL?.trim()
  return raw ? raw.replace(/\/+$/, '') : 'http://localhost:3000'
}
