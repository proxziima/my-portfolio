import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPreviewUser, isPreviewSecret, isSafePreviewPath } from '@/lib/cms/preview'

const forbidden = () => new Response('You are not allowed to preview this page', { status: 403 })

// Opened by the CMS "Preview" button: ?path=/blog/<slug>&previewSecret=…
// The CMS runs on its own origin, so the admin session is checked by forwarding its cookie.
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url)
  if (!isPreviewSecret(searchParams.get('previewSecret'))) return forbidden()

  const path = searchParams.get('path')
  if (!isSafePreviewPath(path)) return new Response('Preview path must be a relative path', { status: 400 })

  const draft = await draftMode()
  const user = await getPreviewUser(request.headers.get('cookie'))
  if (!user) {
    draft.disable()
    return forbidden()
  }

  draft.enable()
  redirect(path)
}
