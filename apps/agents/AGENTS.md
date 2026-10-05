# Project rules

This app is the portfolio twin. Read [README.md](README.md) first (architecture, local setup, env, how to add skills, tools and connections) and the design spec, [docs/superpowers/specs/2026-10-04-portfolio-twin-agent-design.md](../../docs/superpowers/specs/2026-10-04-portfolio-twin-agent-design.md). Where the README and the spec disagree, the README describes the current code.

- The system prompt is `agent/instructions.ts` (composed per turn from `skills/*`), not `agent/instructions.md`. Edit a skill's `SKILL.md` and bump its `metadata.version` instead of adding prose elsewhere.
- A model-facing tool is offered only through `toolGranted` and a skill's `skill.ts`. Never set `defaultTools` back to true, and never add a static connection without reading the README's connection section: eve offers `connection_search`/`connection_execute` on every turn, outside skill gating.
- The agents service is never public: eve's Workflow routes are unauthenticated. Webhooks enter through `apps/web/app/api/twin/hooks/[provider]`.
- Env is read with `getEnv()` (lazy). Never at module top level: eve evaluates modules at build time, without secrets. A new variable goes in `agentsEnvSchema` (`packages/twin/src/env.ts`), `.env.example`, `docker-compose.yml` and `.env.deploy.example`.
- Local Postgres is `127.0.0.1:5433`, never `localhost`. Never reset `apps/payload/payload.db`; back it up before any CMS schema change.

# eve Agent App

This project uses the eve framework: an agent is a directory of files under `agent/`, and eve compiles and runs it.

For a content-only change to the root agent's identity, purpose, tone, or response guidelines, edit its existing authored instructions. Fresh projects use `agent/instructions.md`; a project may instead use `agent/instructions.ts` or files under `agent/instructions/`. You do not need to read the framework docs for a content-only instructions change. A fresh project already has its selected model in `agent/agent.ts`; preserve that file unless the user asks to change the model.

## Read the docs before writing code

```sh
ls node_modules/eve/docs
```

Start with `docs/README.md`: it maps each task to the page that covers it. Read that page before authoring tools, connections, channels, skills, subagents, schedules, or deployment. In a workspace or local package install, resolve the installed `eve` package location first. If the package docs are missing, use https://eve.dev/docs.

Use a bounded authoring loop:

1. Read the relevant page and inspect only files you will modify or need to imitate.
2. Stop discovery once the file location, imports, and definition shape are clear. Implement the smallest complete behavior the user requested.
3. Run one narrow verification. Expand investigation only when it fails or the request needs project-specific details.

Follow links or inspect public types only when the routed page leaves the task unanswered. Do not recursively glob `node_modules`, enumerate the entire docs tree, or read unrelated scaffold files when the direct path is known. Package-manager links can hide files from recursive glob tools even though direct reads work.

## Prefer an existing integration

When a task names an external product or service, search the registry before implementing its integration. For a generic capability, author a tool instead.

```sh
eve registry search <query> --json
eve registry view <item>
```

Prefer items whose `implementation` is `native`; use Chat SDK adapters when no native channel fits. `registry view` links the item's documentation.

Install without driving interactive prompts:

```sh
eve add <item> --non-interactive
```

Exit code 0 means setup completed, 1 failed, and 2 needs an answer or a prerequisite. On exit 2, run the `next.command` from the final NDJSON event. For a non-secret question, replace its `<JSON value>` answer placeholder with the answer you collected; string values need JSON quotes. Never pass a secret in `--answer`. See `docs/install-integrations.mdx` for setup prerequisites.

## Use eve for Vercel operations

Use eve to link and deploy Vercel projects:

```sh
eve link --non-interactive --project <name-or-id> [--team <team-id-or-slug>]
eve deploy --non-interactive --yes [--project <name-or-id>]
```

A setup may report `eve link` as a prerequisite; run it, then retry the continuation. When a completed setup event has `deploymentRequired: true`, run the `next` command it reports.

## Validate the change

Run the validation the task requests. When it does not establish the behavior you changed, run the narrowest relevant check.
