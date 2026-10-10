import { NextResponse, type NextRequest } from 'next/server'
import { posthogConfig } from '@repo/observability/config'
import { relayTarget } from '@/lib/analytics/relay'

/**
 * The PostHog reverse proxy, resolved per request so the region is runtime config
 * (`next.config` rewrites are frozen into a standalone build).
 */
export function proxy(request: NextRequest) {
  const target = relayTarget(request.nextUrl.pathname, request.nextUrl.search, posthogConfig())
  if (!target) return new NextResponse(null, { status: 404 })
  const headers = new Headers(request.headers)
  headers.set('host', target.host)
  // PostHog ingestion needs no cookies; never leak the site's own (e.g. the signed visitor id).
  headers.delete('cookie')
  return NextResponse.rewrite(target, { request: { headers } })
}

export const config = { matcher: '/relay/:path*' }
