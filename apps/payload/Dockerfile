# syntax=docker/dockerfile:1
# Payload CMS (workspace `cms`). Build from the repository root:
#   docker build -f apps/payload/Dockerfile .
# The image keeps the whole workspace (sources + node_modules) so the Payload CLI works in the container:
#   docker compose exec cms bun run seed
#   docker compose exec cms bun run payload migrate:status

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
RUN bunx turbo run build --filter=cms \
  && rm -rf .turbo apps/payload/.next/cache

FROM build AS runtime
ENV NODE_ENV=production \
    NODE_OPTIONS=--no-deprecation \
    PORT=3001 \
    DATABASE_URL=file:/data/payload.db \
    MEDIA_DIR=/data/media \
    SCENES_DIR=/data/scenes \
    FAVICONS_DIR=/data/favicons
# /data is the volume (database + uploads). A new named volume copies this directory, owner included.
RUN mkdir -p /data/media /data/scenes /data/favicons \
  && chown -R node:node /data apps/payload/.next
# The release (e.g. 0.0.1) CI built this image for. Last, so a new value reuses every layer above.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
USER node
WORKDIR /app/apps/payload
EXPOSE 3001
# Payload starts on the first request (the compose healthcheck sends one) and runs any pending
# migration from src/migrations before answering it.
CMD ["node", "node_modules/next/dist/bin/next", "start", "--port", "3001", "--hostname", "0.0.0.0"]
