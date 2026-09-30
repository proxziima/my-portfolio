import 'server-only'
import type { ReactElement } from 'react'
import { cookies, draftMode } from 'next/headers'
import { notFound } from 'next/navigation'
import { PAYLOAD_TOKEN_COOKIE } from '@/lib/cms/preview'
import type { PostView } from '@/lib/cms/types'
import { PostPreview } from './PostPreview'
import { PreviewNotice } from './PreviewNotice'

/**
 * The body of every post preview page. The public blog launches later: until then a post renders only for
 * an editor in draft mode (entered through /api/preview from the CMS), and every other request is a 404.
 * `load` reads the draft with the editor's `payload-token`.
 */
export async function draftPreview(load: (token: string) => Promise<PostView | null>): Promise<ReactElement> {
  const { isEnabled } = await draftMode()
  if (!isEnabled) notFound()

  const token = (await cookies()).get(PAYLOAD_TOKEN_COOKIE)?.value
  // Draft mode outlives the admin session (logout, expiry): say so instead of showing published content.
  if (!token) {
    return (
      <PreviewNotice title="Your CMS session has expired">
        Sign in to the CMS again and re-open the preview from the post.
      </PreviewNotice>
    )
  }
  return <PostPreview post={await load(token)} />
}
