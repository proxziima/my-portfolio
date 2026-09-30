// Pure helpers behind the admin "Preview" button, kept apart so they can be tested without Payload.
// The web app owns the preview flow: `${WEB_URL}/api/preview` checks the secret, verifies the
// signed-in admin through the forwarded `payload-token` cookie, enables Next draft mode and redirects.

export interface PreviewUrlArgs {
  webUrl?: string | null
  secret?: string | null
  /** Relative path on the web app, e.g. "/blog/my-post". */
  path?: string | null
}

/** `${webUrl}/api/preview?path=…&previewSecret=…`, or `null` (button hidden) when any part is missing. */
export const buildPreviewUrl = ({ webUrl, secret, path }: PreviewUrlArgs): string | null => {
  const base = webUrl?.trim().replace(/\/+$/, '')
  if (!base || !secret || !path) return null
  const params = new URLSearchParams({ path, previewSecret: secret })
  return `${base}/api/preview?${params.toString()}`
}

/** "/blog/<slug>", or `null` while the post has no slug yet. */
export const postPreviewPath = (slug: unknown): string | null =>
  typeof slug === 'string' && slug.trim() ? `/blog/${encodeURIComponent(slug.trim())}` : null
