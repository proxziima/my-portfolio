import type { Metadata } from 'next'
import { cookies, draftMode } from 'next/headers'
import { notFound } from 'next/navigation'
import { PAYLOAD_TOKEN_COOKIE } from '@/lib/cms/preview'
import { getPostBySlug } from '@/lib/cms/posts'
import { PostArticle } from '@/features/blog/PostArticle'
import { PreviewBanner } from '@/features/blog/PreviewBanner'
import { PreviewNotice } from '@/features/blog/PreviewNotice'

export const metadata: Metadata = { title: 'Draft preview', robots: { index: false, follow: false } }

export default async function PostPreviewPage({ params }: PageProps<'/blog/[slug]'>) {
  // The public blog launches later. Until then a post renders only for an editor in draft mode
  // (entered through /api/preview from the CMS), and every other request is a 404.
  const { isEnabled } = await draftMode()
  if (!isEnabled) notFound()

  const [{ slug }, jar] = await Promise.all([params, cookies()])
  const token = jar.get(PAYLOAD_TOKEN_COOKIE)?.value
  // Draft mode outlives the admin session (logout, expiry): say so instead of showing published content.
  if (!token) {
    return (
      <PreviewNotice title="Your CMS session has expired">
        Sign in to the CMS again and re-open the preview from the post.
      </PreviewNotice>
    )
  }

  const post = await getPostBySlug(slug, { draft: true, token })
  if (!post) notFound()

  return (
    <main>
      <PreviewBanner />
      <PostArticle post={post} />
    </main>
  )
}
