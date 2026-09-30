import { fileURLToPath } from 'node:url'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // `next build` also writes a self-contained server to `.next/standalone` (what the Docker image runs).
  // Tracing starts at the monorepo root so workspace packages and bun's `node_modules/.bun` store are included.
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
}

export default nextConfig
