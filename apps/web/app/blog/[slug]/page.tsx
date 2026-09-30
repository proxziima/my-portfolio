import type { Metadata } from 'next'
import { cookies, draftMode } from 'next/headers'
import { notFound } from 'next/navigation'
import { PAYLOAD_TOKEN_COOKIE } from '@/lib/cms/preview'
import { getPostBySlug } from '@/lib/cms/posts'
import { PostArticle } from '@/features/blog/PostArticle'
import { PreviewBanner } from '@/features/blog/PreviewBanner'

export const metadata: Metadata = { title: 'Draft preview', robots: { index: false, follow: false } }

export default async function PostPreviewPage({ params }: PageProps<'/blog/[slug]'>) {
  // The public blog launches later. Until then a post renders only for an editor in draft mode
  // (entered through /api/preview from the CMS), and every other request is a 404.
  const { isEnabled } = await draftMode()
  if (!isEnabled) notFound()

  const [{ slug }, jar] = await Promise.all([params, cookies()])
  const post = await getPostBySlug(slug, { draft: true, token: jar.get(PAYLOAD_TOKEN_COOKIE)?.value })
  if (!post) notFound()

  return (
    <main>
      <PreviewBanner />
      <PostArticle post={post} />
    </main>
  )
}
