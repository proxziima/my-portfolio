# syntax=docker/dockerfile:1
# Portfolio site (workspace `web`). Build from the repository root:
#   docker build -f apps/web/Dockerfile .
# Runs Next's standalone server. Every setting (CMS_URL, REVALIDATE_SECRET, PREVIEW_SECRET) is read at
# runtime, so one image serves any environment; NEXT_PUBLIC_* would be frozen at build time, so none is set.

FROM oven/bun:1.3.10 AS bun

FROM node:24-bookworm-slim AS base
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx
ENV NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1
WORKDIR /app

# Manifests first, so the install layer is reused until a package.json or the lockfile changes.
FROM base AS build
COPY package.json bun.lock .npmrc ./
COPY apps/agents/package.json apps/agents/
COPY apps/payload/package.json apps/payload/
COPY apps/web/package.json apps/web/
COPY packages/cms-types/package.json packages/cms-types/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/twin/package.json packages/twin/
COPY packages/typescript-config/package.json packages/typescript-config/
RUN bun install --frozen-lockfile

COPY . .
# next/font/google downloads the fonts here, so the build needs network access.
RUN bunx turbo run build --filter=web

# Standalone output mirrors the monorepo layout: the server is apps/web/server.js. Static assets and
# public/ are not part of it and are copied next to it.
FROM node:24-bookworm-slim AS runtime
# The commit CI built this image from (`/api/health` reports it). Declared here, after every build step,
# so a new value never invalidates the cached install and build layers.
ARG APP_VERSION=dev
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 APP_VERSION=$APP_VERSION
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
