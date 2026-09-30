import type { Metadata } from 'next'
import { draftPreview } from '@/features/blog/draft-preview'
import { getPostById } from '@/lib/cms/posts'

export const metadata: Metadata = { title: 'Live preview', robots: { index: false, follow: false } }

// The CMS Live Preview iframe. Keyed by id because the slug follows the title while the editor types, and a
// URL built from unsaved form data would point at a slug the CMS hasn't stored yet.
export default async function PostLivePreviewPage({ params }: PageProps<'/blog/preview/[id]'>) {
  return draftPreview(async (token) => getPostById((await params).id, { token }))
}
