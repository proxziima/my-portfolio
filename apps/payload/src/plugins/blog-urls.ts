// Pure helpers behind the blog plugins, kept apart so they can be tested without Payload.

/** "Post title | Site name", falling back to "Blog" when the profile has no name yet. */
export const seoTitle = (title: string | null | undefined, siteName: string | null | undefined): string => {
  const site = siteName?.trim() || 'Blog'
  return title?.trim() ? `${title.trim()} | ${site}` : site
}

/** `${WEB_URL}/blog/<slug>`, or the blog index while the slug is empty. */
export const blogPostUrl = (webUrl: string | undefined, slug: string | null | undefined): string => {
  const base = `${(webUrl ?? '').replace(/\/+$/, '')}/blog`
  return slug ? `${base}/${slug}` : base
}

/** Breadcrumb docs (root first) → "/parent/child". */
export const categoryPath = (docs: Array<Record<string, unknown>>): string =>
  docs.reduce<string>((url, doc) => `${url}/${String(doc.slug ?? '')}`, '')
