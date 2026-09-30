import { cmsAdminOrigin } from '@/lib/cms/client'
import type { PostView } from '@/lib/cms/types'
import { PostArticle } from './PostArticle'
import { PreviewBanner } from './PreviewBanner'
import { PreviewNotice } from './PreviewNotice'
import { RefreshRouteOnSave } from './RefreshRouteOnSave'

/**
 * A draft post, or a notice while the CMS has nothing to show yet. Both keep the refresher: inside the
 * CMS Live Preview iframe it re-renders this page after every (auto)save, so an unsaved draft recovers.
 */
export function PostPreview({ post }: { post: PostView | null }) {
  const refresher = <RefreshRouteOnSave cmsOrigin={cmsAdminOrigin()} />
  if (!post) {
    return (
      <>
        <PreviewNotice title="Not saved yet">
          This draft isn&rsquo;t saved yet. The preview updates on the next save.
        </PreviewNotice>
        {refresher}
      </>
    )
  }
  return (
    <main>
      <PreviewBanner />
      <PostArticle post={post} />
      {refresher}
    </main>
  )
}
