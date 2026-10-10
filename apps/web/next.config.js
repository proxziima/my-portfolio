import { fileURLToPath } from 'node:url'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // `next build` also writes a self-contained server to `.next/standalone` (what the Docker image runs).
  // Tracing starts at the monorepo root so workspace packages and bun's `node_modules/.bun` store are included.
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  // Shared TypeScript source (contract, db, redaction) compiled by Next, like @repo/cms-types.
  transpilePackages: ['@repo/twin', '@repo/observability'],
  // PostHog's API paths end in a slash (`/e/`); a redirect would drop the POST body.
  skipTrailingSlashRedirect: true,
  // Two root layouts: unmatched URLs render `app/global-not-found.tsx` (still experimental in this Next).
  experimental: {
    globalNotFound: true,
    // the site's CSS is ~9 KB gzipped and every page is dynamic: inline it, no render-blocking requests
    inlineCss: true,
  },
  // Maps feed PostHog's symbolication; scripts/sourcemaps.ts uploads them (when credentials exist) and
  // deletes them after the build, so none is ever served.
  productionBrowserSourceMaps: true,
  async headers() {
    return [
      // content-hashed by scripts/assets: a changed file is a new URL
      { source: '/assets/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      // unhashed public files (js-dos runtime and bundles, OS icons): a deploy shows within the hour.
      // `.*` crosses slashes, so `_next/` (Next's own immutable cache) and `assets/` (the rule above) are excluded.
      { source: '/:file((?!_next/|assets/).*\\.(?:jsdos|wasm|png|ico|css|js))', headers: [{ key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' }] },
    ]
  },
}

export default nextConfig
