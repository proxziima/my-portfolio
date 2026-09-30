import type { Metadata } from 'next'
import { draftPreview } from '@/features/blog/draft-preview'
import { getPostBySlug } from '@/lib/cms/posts'

export const metadata: Metadata = { title: 'Draft preview', robots: { index: false, follow: false } }

// The post's public URL, opened by the CMS "Preview" button.
export default async function PostPreviewPage({ params }: PageProps<'/blog/[slug]'>) {
  return draftPreview(async (token) => getPostBySlug((await params).slug, { draft: true, token }))
}
