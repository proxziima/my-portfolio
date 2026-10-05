# Portfolio Twin Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first-person "twin" agent on eve 0.71 that runs behind the `/os` MSN Messenger window. It answers from Payload CMS only, evaluates call intent deterministically, renders a Cal.com booker inline, and gates restricted disclosures on asynchronous owner approval.

**Architecture:**

- **`apps/agents`** is the eve agent, self-hosted with the Postgres Workflow world. It is reachable only on the internal network.
- **`apps/web`** gains a backend-for-frontend (`/api/twin/*`). It owns visitor identity, session ownership, rate limits and output-boundary redaction, and proxies eve's NDJSON protocol to `eve/react` in the Messenger window.
- **`packages/twin`** holds what both apps share: the contract (zod), the env schemas, the Drizzle schema and queries, and the redactor.
- **`apps/payload`** gains disclosure tiers, a `knowledge` collection, two custom MCP tools and a redact-terms endpoint.

**Tech stack:**

| Area | Choice |
|---|---|
| Agent framework | eve 0.71.0 |
| AI SDK | ai 7, `@openrouter/ai-sdk-provider` 3.1.0, `@ai-sdk/mcp` 2.0.66 |
| Database | Postgres 17, Drizzle ORM 0.45 + drizzle-kit 0.31, pg 8; pglite 0.5 in tests only |
| Auth tokens | jose 6 |
| Validation | zod 4.5.4 |
| Web | Next.js 16.3, React 19.2 |
| CMS | Payload 3.90.2 (SQLite) |
| Tests | vitest 5 |
| Tooling | bun 1.3.10, turbo 2 |

**Spec:** `docs/superpowers/specs/2026-10-04-portfolio-twin-agent-design.md`. Read it first; every design decision is justified there.
**eve reference:** `docs/superpowers/plans/eve-0.71-api-notes.md`. Exact eve signatures, extracted from the installed package. Read the relevant section before writing any eve code. The bundled docs live at `node_modules/.bun/eve@0.71.0+33e75dff224d38ab/node_modules/eve/docs/`.

---

## Phase files

The plan is split so that each implementer loads only its phase:

| Phase | File | Tasks |
|---|---|---|
| A — Foundation (`packages/twin`) | `2026-10-04-portfolio-twin-agent-phase-a.md` | A1–A7 |
| B — Payload CMS | `2026-10-04-portfolio-twin-agent-phase-b.md` | B1–B4 |
| C — Agent (`apps/agents`) | `2026-10-04-portfolio-twin-agent-phase-c.md` | C1–C14 |
| D — Web (BFF + Messenger) | `2026-10-04-portfolio-twin-agent-phase-d.md` | D1–D7 |
| E — Evals, CI, ops, docs | `2026-10-04-portfolio-twin-agent-phase-e.md` | E1–E7 |

Execute the phases in order. The tasks within a phase are ordered by dependency.

## Global conventions (apply to every task)

1. **Style:**
   - Single quotes, no semicolons, 2-space indent, trailing commas, width 100. Root `.prettierrc.json` (task A1) encodes this.
   - Every exported function, component and type gets a one-line JSDoc. Comments explain *why*, never *what*.
   - Named exports, except where eve requires a default export (files under `apps/agents/agent/**`).
2. **TypeScript:**
   - `strict` and `noUncheckedIndexedAccess`. No `any`.
   - Schema validation at every boundary with zod, using `.parse` (throws). Never `safeParse` followed by silent fallback.
   - The only place `safeParse` is allowed is where the spec defines a typed fallback, and that is spelled out in the task.
3. **No placeholders:** no TODO, no stubs, no commented-out code. If a task cannot be completed as written, stop and report. Do not improvise.
4. **eve code:**
   - Before writing a file under `apps/agents/agent/`, read the matching section of `eve-0.71-api-notes.md`.
   - Anything marked **INFERENCE** there must be verified by running `bunx eve info` (discovery) or the narrow test the task gives.
   - If it does not hold, stop and report.
5. **Payload database safety:**
   - Never run anything that writes to `apps/payload/payload.db`: no `payload migrate` against it, no seed and no deletes.
   - Migrations are generated against a throwaway copy:

     ```bash
     DATABASE_URL=file:./.tmp/migrate.db bun run --cwd apps/payload payload migrate:create <name>
     ```

     Delete `.tmp/` afterwards.
6. **Commits:**
   - Conventional, with a scope (`twin`, `agents`, `cms`, `web`, `os`, `ci`, `docs`).
   - Lowercase, behaviour-describing subjects.
   - End every message with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
   - Commit only the files the task lists.
7. **Commands run from the repo root** unless the step says otherwise. On Windows use the Bash tool (Git Bash).
8. **Local Postgres:** this machine has no Docker. PostgreSQL 17 runs in WSL `Ubuntu-24.04` on port 5433 with role and database `twin`/`twin` (`wsl -d Ubuntu-24.04 -u root -- pg_lsclusters` wakes it). Connection string: `postgres://twin:twin@127.0.0.1:5433/twin`. Always use `127.0.0.1`, never `localhost`: localhost resolves to ::1, which WSL does not forward. `docker-compose.dev.yml` is the equivalent for machines with Docker. Wherever a task says `docker compose -f docker-compose.dev.yml up -d postgres`, check `pg_isready -h 127.0.0.1 -p 5433` instead (psql tools are at `C:/Users/felip/AppData/Local/Programs/pgsql/bin`).

## File map

```
.prettierrc.json                                  A1  repo formatting
docker-compose.dev.yml                            A1  local Postgres
packages/twin/
  package.json, tsconfig.json, vitest.config.ts,
  drizzle.config.ts                               A1
  src/contract/{state,intent,schedule,notice,limits,query,index}.ts   A2
  src/env.ts                                      A3
  src/db/{schema,client,migrate,index}.ts         A4
  src/db/queries/{conversations,visitors,evaluations,approvals,bookings,transcripts,search-cache,rate-limits,spend,retention}.ts  A5
  src/testing/test-db.ts                          A4
  src/redact/{redact,stream,index}.ts             A6
  migrations/*                                    A4 (generated)
  tests/**                                        A2–A6
apps/payload/src/
  fields/disclosure.ts, access/disclosure-read.ts B1
  collections/Knowledge.ts                        B2
  mcp/twin-tools.ts, mcp/mcp-plugin.ts            B3
  endpoints/redact-terms.ts                       B3
  globals/Messenger.ts                            B4
  migrations/<ts>_twin.ts                         B4
apps/agents/
  package.json, tsconfig.json, vitest.config.ts   C1
  agent/agent.ts                                  C1
  agent/lib/{env,db,models,untrusted,state-digest,tool-gate}.ts   C2–C4
  agent/lib/skills/{define,compose,registry}.ts   C3
  skills/<six>/SKILL.md + skill.ts                C3
  agent/instructions.ts                           C4
  agent/channels/eve.ts                           C5
  agent/lib/payload-mcp.ts, agent/tools/search_portfolio.ts       C6
  agent/lib/google-freebusy.ts, agent/tools/check_availability.ts C7
  agent/tools/{schedule_call,record_call_decline,note_visitor,no_reply,web_search}.ts, agent/lib/booking-ref.ts  C8
  agent/lib/intent/{weights,signals,score,classify}.ts, agent/hooks/intent.ts   C9
  agent/lib/telegram.ts, agent/tools/request_disclosure.ts        C10
  agent/channels/webhooks.ts                      C11
  agent/hooks/transcript.ts, agent/instrumentation/spend.ts       C12
  agent/memory/visitor.ts                         C13
  agent/schedules/purge.ts                        C14
apps/web/
  lib/twin/{env,cookie,jwt,limits,proxy,filter}.ts                D1–D3
  app/api/twin/eve/v1/[...path]/route.ts          D3
  app/api/twin/hooks/[provider]/route.ts          D4
  app/api/twin/me/route.ts                        D4
  features/os/apps/messenger/{use-twin.ts,History.tsx,Conversation.tsx,BookingDialog.tsx,parts.ts}  D5–D6
  lib/cms/{types,mappers}.ts                      D5
apps/agents/evals/**, apps/agents/fixtures/offline/**             E1–E3
apps/agents/Dockerfile, docker-compose.yml, apps/*/Dockerfile     E4
.github/workflows/ci.yml, scripts/scan-client-bundle.ts           E5
apps/agents/README.md, apps/agents/.env.example, apps/web/.env.example, docs/deploy-easypanel.md  E6
```

## Verification gates

- **End of Phase A:** `bun run --cwd packages/twin test` passes and `bun run --cwd packages/twin check-types` is clean.
- **End of Phase B:** `bun run --cwd apps/payload test:int` passes, the types are regenerated, and the migration is committed.
- **End of Phase C:**
  - `bun run --cwd apps/agents test` passes.
  - `bunx --cwd apps/agents eve info` lists the expected tools, hooks, channels, memory and schedule, with no diagnostics.
  - `eve build` succeeds.
- **End of Phase D:** `bun run --cwd apps/web test` passes. `bun run --cwd apps/web check-types` and `lint` are clean.
- **End of Phase E:**
  - The offline evals pass.
  - The CI workflow runs green locally via its documented commands.
  - The Docker images build.
  - The final task (E7) runs the full system against local Postgres.
