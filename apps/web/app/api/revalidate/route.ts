import { revalidateTag } from 'next/cache'
import { CMS_TAG } from '@/lib/cms/client'
import { secretsMatch } from '@/lib/security/secrets'

export async function POST(request: Request) {
  if (!secretsMatch(request.headers.get('x-revalidate-secret'), process.env.REVALIDATE_SECRET)) {
    return Response.json({ revalidated: false }, { status: 401 })
  }
  revalidateTag(CMS_TAG, { expire: 0 })
  return Response.json({ revalidated: true })
}
