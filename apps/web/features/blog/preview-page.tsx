import 'server-only'
import type { ReactElement } from 'react'
import { cookies, draftMode } from 'next/headers'
import { notFound } from 'next/navigation'
import { getEditor, PAYLOAD_TOKEN_COOKIE } from '@/lib/cms/preview'
import type { PostView } from '@/lib/cms/types'
import { PostPreview } from './PostPreview'
import { PreviewNotice } from './PreviewNotice'

/** A guard either lets the editor through with their `payload-token`, or answers for the page. */
export type PreviewAccess = { token: string } | { denied: ReactElement }
export type PreviewGuard = () => Promise<PreviewAccess>

const sessionToken = async () => (await cookies()).get(PAYLOAD_TOKEN_COOKIE)?.value

/**
 * The Preview button's top-level navigation: /api/preview enabled draft mode, a first-party cookie.
 * Every other request is a 404, because the public blog launches later.
 */
export const requireDraftMode: PreviewGuard = async () => {
  if (!(await draftMode()).isEnabled) notFound()
  const token = await sessionToken()
  // Draft mode outlives the admin session (logout, expiry): say so instead of showing published content.
  if (token) return { token }
  return {
    denied: (
      <PreviewNotice title="Your CMS session has expired">
        Sign in to the CMS again and re-open the preview from the post.
      </PreviewNotice>
    ),
  }
}

/**
 * The CMS Live Preview iframe. Draft mode's cookie set inside the iframe doesn't survive there (the
 * browser drops it), but the admin's own `payload-token` does, so every request is checked against the
 * CMS. No session, or one the CMS rejects, is a 404: the route doesn't admit it exists.
 */
export const requireEditorSession: PreviewGuard = async () => {
  const token = await sessionToken()
  if (!token || !(await getEditor(token))) notFound()
  return { token }
}

/** The body of both post preview pages: the guard decides who gets in, `load` reads the draft as them. */
export async function previewPage(
  guard: PreviewGuard,
  load: (token: string) => Promise<PostView | null>,
): Promise<ReactElement> {
  const access = await guard()
  if ('denied' in access) return access.denied
  return <PostPreview post={await load(access.token)} />
}
