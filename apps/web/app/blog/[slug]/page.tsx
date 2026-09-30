import type { Metadata } from 'next'
import { previewPage, requireDraftMode } from '@/features/blog/preview-page'
import { getPostBySlug } from '@/lib/cms/posts'

export const metadata: Metadata = { title: 'Draft preview', robots: { index: false, follow: false } }

// The post's public URL, opened by the CMS "Preview" button through /api/preview (draft mode).
export default async function PostPreviewPage({ params }: PageProps<'/blog/[slug]'>) {
  return previewPage(requireDraftMode, async (token) => getPostBySlug((await params).slug, { draft: true, token }))
}
