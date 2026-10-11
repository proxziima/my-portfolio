# syntax=docker/dockerfile:1
# Portfolio twin agent (workspace `agents`, eve). Build from the repository root:
#   docker build -f apps/agents/Dockerfile .
# eve's self-hosting guide: ship the app source, .output/ and installed dependencies together.
# Never exposed publicly: the Workflow routes it serves are unauthenticated (spec §2).

FROM oven/bun:1.3.10 AS bun

FROM node:24-bookworm-slim AS base
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx
ENV TURBO_TELEMETRY_DISABLED=1 EVE_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1
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
# Not skipping the sandbox prewarm: the output must be able to start its pinned just-bash sandbox.
RUN bun run --cwd apps/agents build

# Whole /app, so the workspace layout eve's startup resolves (sandbox prewarm modules) is preserved.
FROM base AS runtime
ENV NODE_ENV=production PORT=3000
COPY --from=build --chown=node:node /app /app
# The release (e.g. 0.0.1) CI built this image for. Last, so a new value reuses every layer above.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
USER node
EXPOSE 3000
# Schema first (the Workflow world, then the twin tables), then the server and its schedule runner.
CMD ["sh", "-c", "bun run --cwd apps/agents world:setup && bun run --cwd packages/twin db:migrate && bun run --cwd apps/agents start"]
