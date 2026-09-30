import type { Metadata } from 'next'
import { previewPage, requireEditorSession } from '@/features/blog/preview-page'
import { getPostById } from '@/lib/cms/posts'

export const metadata: Metadata = { title: 'Live preview', robots: { index: false, follow: false } }

// The CMS Live Preview iframe, loaded directly (no /api/preview hop) and authenticated by the admin
// session on every request. Keyed by id because the slug follows the title while the editor types.
export default async function PostLivePreviewPage({ params }: PageProps<'/blog/preview/[id]'>) {
  return previewPage(requireEditorSession, async (token) => getPostById((await params).id, { token }))
}
