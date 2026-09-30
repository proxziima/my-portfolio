import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'
import { isSafePreviewPath } from '@/lib/cms/preview'

// Linked from the preview banner. ?path= must be a safe relative path; anything else goes home.
export async function GET(request: Request): Promise<Response> {
  const path = new URL(request.url).searchParams.get('path')
  ;(await draftMode()).disable()
  redirect(isSafePreviewPath(path) ? path : '/')
}
