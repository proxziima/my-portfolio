# Owner Approvals over iMessage via Photon: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap the Sendblue transport, which sits unmerged on branch `feat/imessage-owner-approvals`, for Photon. Inbound uses eve's `photonIMessageChannel`, as in the personal-agent-template reference. Outbound uses the Photon adapter eve bundles. The database, reply codes, grammar and workflow stay.

**Architecture:**
- **New channel.** `agent/channels/photon.ts` is a `photonIMessageChannel` with lazy portable credentials, `route: '/webhooks/photon'`, and `onMessage: handleOwnerMessage`.
- **Inbound handler.** `handleOwnerMessage` (`agent/lib/photon-inbound.ts`) decides a coded owner reply, answers through `ctx.thread.post`, and always returns `null`, so no agent turn starts.
- **Outbound.** `sendToOwner` (`agent/lib/imessage.ts`) calls `openDM(owner)` and then `postMessage` on `@photon-ai/chat-adapter-imessage`.
- **Forwarder.** The web forwarder gains a `photon` provider.
- **Removed.** The Sendblue route, handler, SDK and offline stub go.

**Tech Stack:** eve 0.71 (`eve/channels/photon`), `@photon-ai/chat-adapter-imessage` 3.2.0 (the version eve bundles) with its peer `chat` 4.41.1, zod 4, vitest, Next.js route handler.

**Spec:** `docs/superpowers/specs/2026-10-05-imessage-owner-approvals-design.md` (the Photon revision). Read it first.

---

## Global conventions (every task)

1. **Style.** Single quotes, no semicolons, 2-space indent, trailing commas. Every export gets a one-line JSDoc, and comments explain *why*. Strict TS, no `any`. In tests, `as unknown as T` is allowed for fakes. No TODOs, no commented-out code.
2. **Where to work.** Only in the worktree `D:\Second Brain\01.PROJETOS\applications\my-portfolio\.claude\worktrees\feat-imessage-approvals`. Never cd into the parent checkout.
3. **Bash guard.** It rejects compound commands (`&&`, `;`, `$(…)`, heredocs) that contain the word `git`, and quoted executable paths. Run every git command alone.
4. **Commits.**
   - Conventional, with a scope, ending with `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
   - Never stage `apps/payload/src/app/(payload)/admin/importMap.js` or the root `package.json`.
   - Stage only the listed files.
5. **Secrets and data.** Never print secrets. Never read gitignored `.env` files with a tool that prints them. Never touch `apps/payload/payload.db`.
6. **Env reads.** Use `getEnv()`, never at module top level. The single, documented exception is `IMESSAGE_WEBHOOK_SECRET` in the channel file: eve's own example reads it when the module loads.

## File map

```
packages/twin/src/env.ts, packages/twin/tests/env.test.ts            T1  imessage group = IMESSAGE_PROJECT_ID/SECRET, IMESSAGE_WEBHOOK_SECRET, OWNER_PHONE_NUMBER
apps/agents/package.json, bun.lock                                     T2  + @photon-ai/chat-adapter-imessage 3.2.0, chat 4.41.1; − sendblue
apps/agents/agent/lib/imessage.ts, apps/agents/tests/imessage.test.ts  T2  photonCredentials + sendToOwner via openDM/postMessage
apps/agents/agent/lib/photon-inbound.ts (+ tests/photon-inbound.test.ts)  T3  handleOwnerMessage
apps/agents/agent/channels/photon.ts                                   T3  photonIMessageChannel
apps/agents/agent/channels/webhooks.ts                                 T3  drop the sendblue route
deleted: agent/lib/sendblue-webhook.ts, tests/sendblue-webhook.test.ts, agent/lib/secrets.ts   T3
apps/agents/agent/lib/owner-decision.ts, webhook-utils.ts (comments), tests/integration-gating.test.ts,
  tests/request-disclosure-body.test.ts, tests/approval-steps.test.ts   T3
apps/web/app/api/twin/hooks/[provider]/route.ts, apps/web/tests/unit/twin/hooks-route.test.ts  T4
apps/agents/fixtures/offline/{stubs/start.ts, stubs/sendblue.ts (deleted), .env.example}, .github/workflows/ci.yml,
  docker-compose.yml, .env.deploy.example, scripts/scan-client-bundle{,.test}.ts   T5
apps/agents/README.md, apps/agents/.env.example, docs/deploy-easypanel.md, old Sendblue plan header   T6
```

T1 to T3 land as **one** commit at the end of T3, because apps/agents doesn't type-check in between. Each task in that range still makes a local `wip(...)` commit, so its review has a range to read. The controller squashes them.

---

### Task 1: `imessage` env group becomes Photon's

**Files:** Modify `packages/twin/src/env.ts`, `packages/twin/tests/env.test.ts`.

- [ ] **Step 1: Tests first.** In `packages/twin/tests/env.test.ts`:
  1. In the `agents` fixture, replace the five Sendblue and owner entries (`SENDBLUE_API_KEY`, `SENDBLUE_API_SECRET`, `SENDBLUE_FROM_NUMBER`, `SENDBLUE_WEBHOOK_SECRET`, `OWNER_PHONE_NUMBER`) with:
     ```ts
     IMESSAGE_PROJECT_ID: 'photon-project-1',
     IMESSAGE_PROJECT_SECRET: 'photon-project-secret',
     IMESSAGE_WEBHOOK_SECRET: 'photon-webhook-secret',
     OWNER_PHONE_NUMBER: '+5511999998888',
     ```
  2. Replace the half-configured test's regex with:
     ```ts
     /OWNER_PHONE_NUMBER: required by the imessage integration because IMESSAGE_PROJECT_ID, IMESSAGE_PROJECT_SECRET, IMESSAGE_WEBHOOK_SECRET is set/
     ```
  3. Delete the test `'defaults the Sendblue API base'`. Keep `'requires E.164 phone numbers'` as is.
- [ ] **Step 2: Run** `bun run --cwd packages/twin test tests/env.test.ts`. Expected: FAIL (half-configured message and fixture).
- [ ] **Step 3: Implement** in `packages/twin/src/env.ts`:
  1. Set `INTEGRATIONS.imessage` to:
     ```ts
     imessage: ['IMESSAGE_PROJECT_ID', 'IMESSAGE_PROJECT_SECRET', 'IMESSAGE_WEBHOOK_SECRET', 'OWNER_PHONE_NUMBER'],
     ```
  2. Replace the block from `// Sendblue REST base…` through the `OWNER_PHONE_NUMBER` entry with:
     ```ts
     // Photon (Spectrum Cloud) project credentials, as eve's Photon channel and the adapter name them.
     IMESSAGE_PROJECT_ID: z.string().min(1).optional(),
     IMESSAGE_PROJECT_SECRET: z.string().min(1).optional(),
     // The signing secret Photon returns once, when the webhook is created.
     IMESSAGE_WEBHOOK_SECRET: z.string().min(1).optional(),
     // The only number whose replies decide approvals, and where the prompt is sent.
     OWNER_PHONE_NUMBER: e164.optional(),
     ```
- [ ] **Step 4: Run.** `bun run --cwd packages/twin test` should PASS, and `bun run --cwd packages/twin check-types` should be clean. apps/agents won't type-check until T3; that's expected.
- [ ] **Step 5: Commit** (WIP): `git add packages/twin/src/env.ts packages/twin/tests/env.test.ts`, then `git commit -m "wip(twin): T1 imessage group uses Photon credentials" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

---

### Task 2: outbound through the Photon adapter

**Files:** Modify `apps/agents/package.json` and `bun.lock`. Rewrite `apps/agents/agent/lib/imessage.ts` and `apps/agents/tests/imessage.test.ts`.

- [ ] **Step 1: Dependencies, pinned.** Run these one at a time:
  - `bun add --cwd apps/agents --exact @photon-ai/chat-adapter-imessage@3.2.0 chat@4.41.1`
  - `bun remove --cwd apps/agents sendblue`

  Check that `apps/agents/package.json` has `"@photon-ai/chat-adapter-imessage": "3.2.0"` and `"chat": "4.41.1"`, and no `sendblue`.
- [ ] **Step 2: Failing test.** Replace `apps/agents/tests/imessage.test.ts` with:
  ```ts
  import { FatalError } from 'workflow'
  import { beforeEach, describe, expect, it, vi } from 'vitest'

  const PROJECT_SECRET = 'photon-secret-VALUE'
  const IMESSAGE_ENV = {
    IMESSAGE_PROJECT_ID: 'photon-project-1',
    IMESSAGE_PROJECT_SECRET: PROJECT_SECRET,
    IMESSAGE_WEBHOOK_SECRET: 'photon-webhook-VALUE',
    OWNER_PHONE_NUMBER: '+5511999998888',
  }
  const THREAD = 'imessage:iMessage;-;+5511999998888~shared'

  const m = vi.hoisted(() => ({
    env: {} as Record<string, unknown>,
    openDM: vi.fn(),
    postMessage: vi.fn(),
    configs: [] as { credentials: () => unknown }[],
  }))
  vi.mock('@photon-ai/chat-adapter-imessage', () => ({
    createiMessageAdapter: (config: { credentials: () => unknown }) => {
      m.configs.push(config)
      return { openDM: m.openDM, postMessage: m.postMessage }
    },
  }))
  vi.mock('../agent/lib/env', () => ({ getEnv: () => m.env }))

  const { photonCredentials, sendToOwner } = await import('../agent/lib/imessage')

  beforeEach(() => {
    m.openDM.mockReset()
    m.postMessage.mockReset()
    m.env = IMESSAGE_ENV
  })

  describe('sendToOwner', () => {
    it('opens a DM with the owner and posts the text, returning the sent message id', async () => {
      m.openDM.mockResolvedValue(THREAD)
      m.postMessage.mockResolvedValue({ id: 'msg-1', threadId: THREAD, raw: {} })
      expect(await sendToOwner('hello')).toBe('msg-1')
      expect(m.openDM).toHaveBeenCalledWith('+5511999998888')
      expect(m.postMessage).toHaveBeenCalledWith(THREAD, 'hello')
    })

    it('builds one adapter per process, with lazy project credentials', async () => {
      m.openDM.mockResolvedValue(THREAD)
      m.postMessage.mockResolvedValue({ id: 'msg-2', threadId: THREAD, raw: {} })
      await sendToOwner('a')
      await sendToOwner('b')
      expect(m.configs).toHaveLength(1)
      expect(m.configs[0]!.credentials()).toEqual({ projectId: 'photon-project-1', projectSecret: PROJECT_SECRET })
    })

    it('fails permanently when iMessage is not configured, without touching the adapter', async () => {
      m.env = {}
      const err = await sendToOwner('x').catch((e: unknown) => e)
      expect(FatalError.is(err)).toBe(true)
      expect(m.openDM).not.toHaveBeenCalled()
    })

    it('keeps adapter failures retryable, with their cause and without secrets', async () => {
      const cause = new Error('spectrum unavailable')
      m.openDM.mockRejectedValue(cause)
      const err = await sendToOwner('x').catch((e: unknown) => e)
      expect(FatalError.is(err)).toBe(false)
      expect(err).toBeInstanceOf(Error)
      expect((err as Error).message).toBe('Photon send failed')
      expect((err as Error).cause).toBe(cause)
      expect(String(err)).not.toContain(PROJECT_SECRET)
    })
  })

  describe('photonCredentials', () => {
    it('throws when iMessage is not configured', () => {
      m.env = {}
      expect(() => photonCredentials()).toThrow()
    })
  })
  ```
- [ ] **Step 3: Run** `bun run --cwd apps/agents test tests/imessage.test.ts`. Expected: FAIL (old Sendblue module).
- [ ] **Step 4: Implement.** Replace `apps/agents/agent/lib/imessage.ts` with:
  ```ts
  import { createiMessageAdapter, type iMessageAdapter } from '@photon-ai/chat-adapter-imessage'
  import { integrationConfig, requireIntegration } from '@repo/twin/env'
  import { FatalError } from 'workflow'
  import { getEnv } from './env'

  /**
   * Photon project credentials from the `imessage` integration. Passed as a lazy provider (eve's
   * "Other hosts" pattern): eve evaluates modules at build time, where secrets are absent.
   */
  export function photonCredentials(): { projectId: string; projectSecret: string } {
    const im = requireIntegration(getEnv(), 'imessage')
    return { projectId: im.IMESSAGE_PROJECT_ID, projectSecret: im.IMESSAGE_PROJECT_SECRET }
  }

  let adapter: iMessageAdapter | null = null

  /**
   * Texts the owner through Photon and returns the sent message id. It uses the provider API, not an
   * agent turn (eve: durable cross-channel notifications), on the adapter eve's Photon channel
   * bundles. `openDM` resolves or creates the 1:1 chat, so the owner needn't have a live session. An
   * unconfigured integration is permanent (`FatalError`); adapter failures stay retryable for the
   * workflow step, since the adapter exposes no permanent-error classification to rely on.
   */
  export async function sendToOwner(text: string): Promise<string> {
    const im = integrationConfig(getEnv(), 'imessage')
    if (!im) throw new FatalError('iMessage is not configured')
    adapter ??= createiMessageAdapter({ credentials: photonCredentials })
    try {
      const threadId = await adapter.openDM(im.OWNER_PHONE_NUMBER)
      const sent = await adapter.postMessage(threadId, text)
      return sent.id
    } catch (e) {
      throw new Error('Photon send failed', { cause: e })
    }
  }
  ```
  If `requireIntegration` types the group's keys as optional strings, adapt the return to keep it non-optional. Look at its signature in `packages/twin/src/env.ts:127`.
- [ ] **Step 5: Run** `bun run --cwd apps/agents test tests/imessage.test.ts`. Expected: PASS (5 tests). Then run `bunx tsc --noEmit -p apps/agents 2>&1 | grep -E "lib/imessage\.ts|tests/imessage\.test\.ts"`, which must print nothing. Other files still fail until T3.
- [ ] **Step 6: Commit** (WIP): `git add apps/agents/package.json apps/agents/agent/lib/imessage.ts apps/agents/tests/imessage.test.ts bun.lock`, then `git commit -m "wip(agents): T2 sendToOwner through the Photon adapter" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

---

### Task 3: inbound through eve's Photon channel; remove the Sendblue route

**Files:**
- Create `apps/agents/agent/lib/photon-inbound.ts`, `apps/agents/agent/channels/photon.ts` and `apps/agents/tests/photon-inbound.test.ts`.
- Delete `apps/agents/agent/lib/sendblue-webhook.ts`, `apps/agents/tests/sendblue-webhook.test.ts` and `apps/agents/agent/lib/secrets.ts`. Nothing else imports `secretsEqual`; confirm with `git grep -n secretsEqual`.
- Modify `apps/agents/agent/channels/webhooks.ts`, `apps/agents/agent/lib/owner-decision.ts`, `apps/agents/agent/lib/webhook-utils.ts`, `apps/agents/tests/integration-gating.test.ts`, `apps/agents/tests/request-disclosure-body.test.ts` and `apps/agents/tests/approval-steps.test.ts`.

- [ ] **Step 1: Read first:**
  - `node_modules/.bun/eve@0.71.0+5cc7bce1b2bea836/node_modules/eve/docs/channels/photon.mdx`;
  - `node_modules/.bun/eve@0.71.0+5cc7bce1b2bea836/node_modules/eve/dist/src/public/channels/photon/photonIMessageChannel.d.ts`.

  Confirm that Chat SDK's `Thread` has `isDM: boolean` and `post(...)`. The types are re-exported from `chat`: `apps/agents/node_modules/chat/dist/*.d.ts`, or the root `node_modules/chat`.
- [ ] **Step 2: Failing test.** Create `apps/agents/tests/photon-inbound.test.ts`:
  ```ts
  import type { PhotonInboundMessageContext } from 'eve/channels/photon'
  import { beforeEach, describe, expect, it, vi } from 'vitest'
  import { helpText } from '../agent/lib/imessage-reply'
  import type { PhotonMessage } from '../agent/lib/photon-inbound'

  const OWNER = '+5511999998888'
  const IMESSAGE_ENV = {
    IMESSAGE_PROJECT_ID: 'photon-project-1',
    IMESSAGE_PROJECT_SECRET: 'photon-secret-VALUE',
    IMESSAGE_WEBHOOK_SECRET: 'photon-webhook-VALUE',
    OWNER_PHONE_NUMBER: OWNER,
  }

  const m = vi.hoisted(() => ({
    env: {} as Record<string, unknown>,
    post: vi.fn(),
    deliver: vi.fn(),
    findApprovalByCode: vi.fn(),
    listPendingApprovals: vi.fn(),
    decideApproval: vi.fn(),
    getApproval: vi.fn(),
  }))

  vi.mock('../agent/lib/env', () => ({ getEnv: () => m.env }))
  vi.mock('../agent/lib/db', () => ({ db: () => ({}) }))
  vi.mock('@repo/twin/db', () => ({
    findApprovalByCode: m.findApprovalByCode,
    listPendingApprovals: m.listPendingApprovals,
    decideApproval: m.decideApproval,
    getApproval: m.getApproval,
  }))
  vi.mock('../agent/lib/webhook-utils', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../agent/lib/webhook-utils')>()),
    deliver: m.deliver,
  }))

  import { RESEND_TEXT, handleOwnerMessage } from '../agent/lib/photon-inbound'

  const ctx = (isDM = true) => ({ thread: { isDM, post: m.post } }) as unknown as PhotonInboundMessageContext
  const msg = (text: string, from = OWNER, author: { isBot?: boolean; isMe?: boolean } = {}) =>
    ({
      text,
      author: { userId: from, userName: from, fullName: from, isBot: author.isBot ?? false, isMe: author.isMe ?? false },
    }) as unknown as PhotonMessage

  const pending = {
    id: 'ap-1',
    sessionId: 's1',
    sourceId: 'knowledge:5',
    topic: 'Notice period',
    status: 'pending',
    webhookUrl: 'https://hook',
    replyCode: 'K7Q2',
    notifiedAt: new Date('2026-10-05T10:00:00Z'),
    decidedAt: null,
    actor: null,
  }

  const noDatabaseCalls = () => {
    for (const fn of [m.findApprovalByCode, m.listPendingApprovals, m.decideApproval, m.getApproval])
      expect(fn).not.toHaveBeenCalled()
  }

  const spies = (['warn', 'error', 'log', 'info'] as const).map((k) => vi.spyOn(console, k))

  beforeEach(() => {
    vi.resetAllMocks()
    for (const spy of spies) spy.mockImplementation(() => {})
    m.env = IMESSAGE_ENV
    m.post.mockResolvedValue(undefined)
    m.listPendingApprovals.mockResolvedValue([])
  })

  describe('handleOwnerMessage', () => {
    it('ignores everything while iMessage is not configured', async () => {
      m.env = {}
      expect(await handleOwnerMessage(ctx(), msg('YES K7Q2'))).toBeNull()
      noDatabaseCalls()
      expect(m.post).not.toHaveBeenCalled()
    })

    it.each([
      ['a bot', msg('YES K7Q2', OWNER, { isBot: true }), true],
      ['our own message', msg('YES K7Q2', OWNER, { isMe: true }), true],
      ['a group message', msg('YES K7Q2'), false],
    ])('ignores %s', async (_label, message, isDM) => {
      expect(await handleOwnerMessage(ctx(isDM), message)).toBeNull()
      noDatabaseCalls()
      expect(m.post).not.toHaveBeenCalled()
    })

    it.each(['+15551112222', 'owner@icloud.com'])('never answers a stranger (%s), and never logs the handle', async (from) => {
      expect(await handleOwnerMessage(ctx(), msg('YES K7Q2', from))).toBeNull()
      noDatabaseCalls()
      expect(m.post).not.toHaveBeenCalled()
      const logged = spies.flatMap((s) => s.mock.calls.flat().map(String)).join('\n')
      expect(logged).not.toContain(from)
    })

    it('accepts the owner number written another way', async () => {
      m.findApprovalByCode.mockResolvedValue(pending)
      m.decideApproval.mockResolvedValue({ ...pending, status: 'approved', decidedAt: new Date() })
      await handleOwnerMessage(ctx(), msg('YES K7Q2', '+55 11 99999-8888'))
      expect(m.decideApproval).toHaveBeenCalled()
    })

    it('approves by code, wakes the workflow and confirms', async () => {
      m.findApprovalByCode.mockResolvedValue(pending)
      m.decideApproval.mockResolvedValue({ ...pending, status: 'approved', decidedAt: new Date() })
      expect(await handleOwnerMessage(ctx(), msg('YES K7Q2'))).toBeNull()
      expect(m.findApprovalByCode).toHaveBeenCalledWith(expect.anything(), 'K7Q2')
      expect(m.decideApproval).toHaveBeenCalledWith(expect.anything(), 'ap-1', {
        status: 'approved',
        actor: 'imessage:owner',
        reasoning: 'Approved via iMessage',
      })
      expect(m.deliver).toHaveBeenCalledWith('https://hook', 'ap-1', 'approved')
      expect(m.post).toHaveBeenCalledWith('Approved K7Q2: Notice period.')
    })

    it('denies by code', async () => {
      m.findApprovalByCode.mockResolvedValue(pending)
      m.decideApproval.mockResolvedValue({ ...pending, status: 'denied', decidedAt: new Date() })
      await handleOwnerMessage(ctx(), msg('no k7q2'))
      expect(m.decideApproval).toHaveBeenCalledWith(expect.anything(), 'ap-1', expect.objectContaining({ status: 'denied', reasoning: 'Denied via iMessage' }))
      expect(m.post).toHaveBeenCalledWith('Denied K7Q2: Notice period. Nothing was shared.')
    })

    it('tells a late reply what happened and delivers nothing', async () => {
      m.findApprovalByCode.mockResolvedValue(pending)
      m.decideApproval.mockResolvedValue(null)
      m.getApproval.mockResolvedValue({ ...pending, status: 'expired', actor: 'system' })
      await handleOwnerMessage(ctx(), msg('YES K7Q2'))
      expect(m.deliver).not.toHaveBeenCalled()
      expect(m.post).toHaveBeenCalledWith('K7Q2 already expired; nothing was shared.')
    })

    it('re-delivers and re-confirms a repeated decision by the owner', async () => {
      m.findApprovalByCode.mockResolvedValue(pending)
      m.decideApproval.mockResolvedValue(null)
      m.getApproval.mockResolvedValue({ ...pending, status: 'approved', actor: 'imessage:owner' })
      await handleOwnerMessage(ctx(), msg('YES K7Q2'))
      expect(m.deliver).toHaveBeenCalledWith('https://hook', 'ap-1', 'approved')
      expect(m.post).toHaveBeenCalledWith('Approved K7Q2: Notice period.')
    })

    it('answers an unknown code', async () => {
      m.findApprovalByCode.mockResolvedValue(null)
      await handleOwnerMessage(ctx(), msg('YES ZZZZ'))
      expect(m.decideApproval).not.toHaveBeenCalled()
      expect(m.post).toHaveBeenCalledWith('No approval ZZZZ is waiting.')
    })

    it('never decides on a bare reply, even with exactly one approval waiting', async () => {
      m.listPendingApprovals.mockResolvedValue([pending])
      await handleOwnerMessage(ctx(), msg('yes'))
      expect(m.decideApproval).not.toHaveBeenCalled()
      expect(m.post).toHaveBeenCalledWith(helpText([pending]))
    })

    it('lists only the notified approvals in the help text', async () => {
      const unnotified = { ...pending, id: 'ap-2', replyCode: 'M3NP', notifiedAt: null }
      m.listPendingApprovals.mockResolvedValue([pending, unnotified])
      await handleOwnerMessage(ctx(), msg('maybe'))
      expect(m.post).toHaveBeenCalledWith(helpText([pending]))
    })

    it('keeps the decision when the confirmation fails to send', async () => {
      m.findApprovalByCode.mockResolvedValue(pending)
      m.decideApproval.mockResolvedValue({ ...pending, status: 'approved', decidedAt: new Date() })
      m.post.mockRejectedValue(new Error('photon down'))
      expect(await handleOwnerMessage(ctx(), msg('YES K7Q2'))).toBeNull()
      expect(m.decideApproval).toHaveBeenCalled()
      expect(m.deliver).toHaveBeenCalled()
    })

    it('asks the owner to resend when the database fails, without throwing', async () => {
      m.findApprovalByCode.mockRejectedValue(new Error('db down'))
      expect(await handleOwnerMessage(ctx(), msg('YES K7Q2'))).toBeNull()
      expect(m.post).toHaveBeenCalledWith(RESEND_TEXT)
    })
  })
  ```
- [ ] **Step 3: Run** `bun run --cwd apps/agents test tests/photon-inbound.test.ts`. Expected: FAIL (the module is missing).
- [ ] **Step 4: Implement `apps/agents/agent/lib/photon-inbound.ts`:**
  ```ts
  import { decideApproval, findApprovalByCode, getApproval, listPendingApprovals, type ApprovalRecord } from '@repo/twin/db'
  import { integrationConfig } from '@repo/twin/env'
  import type { PhotonIMessageChannelConfig, PhotonInboundMessageContext } from 'eve/channels/photon'
  import { db } from './db'
  import { getEnv } from './env'
  import { helpText, parseOwnerReply, unknownCodeText } from './imessage-reply'
  import { OWNER_ACTOR, planDecision } from './owner-decision'
  import { toE164 } from './phone'
  import { bestEffort, deliver, reason } from './webhook-utils'

  /** An inbound Photon message, as eve's channel hands it to `onMessage`. */
  export type PhotonMessage = Parameters<NonNullable<PhotonIMessageChannelConfig['onMessage']>>[1]

  /** Sent when a reply couldn't be committed: Photon was already answered 200, so nothing redelivers it. */
  export const RESEND_TEXT = 'That reply could not be recorded. Send it again.'

  /** The pending approvals the owner has actually been texted about; only their codes go in help. */
  const notified = (pending: readonly ApprovalRecord[]) => pending.filter((p) => p.notifiedAt)

  /**
   * The Photon channel's `onMessage`: the owner's replies to approval requests. Shaped like the
   * personal-agent-template's channel (bots dropped, the handle normalised to E.164 before matching),
   * but strangers are never answered: this line exists for approvals, and the twin's public
   * conversation is the web Messenger. Always `null`, so no agent turn starts on this channel; the
   * reply is decided here with a strict grammar (no model reads it) and answered on the thread.
   */
  export async function handleOwnerMessage(ctx: PhotonInboundMessageContext, message: PhotonMessage): Promise<null> {
    const im = integrationConfig(getEnv(), 'imessage')
    if (!im || message.author.isBot || message.author.isMe || !ctx.thread.isDM) return null
    // The handle itself is never logged: it is the sender's, not ours to keep.
    if (toE164(message.author.userId) !== im.OWNER_PHONE_NUMBER) {
      console.warn('[photon] message from a number other than the owner; ignored')
      return null
    }
    const reply = (text: string) => bestEffort('photon reply', async () => void (await ctx.thread.post(text)))
    try {
      await answerOwner(message.text, reply)
    } catch (e) {
      console.error(`[photon] owner reply could not be recorded: ${reason(e)}`)
      await reply(RESEND_TEXT)
    }
    return null
  }

  /** Decides one coded reply, or answers with help. Database failures throw to the caller. */
  async function answerOwner(text: string, reply: (text: string) => Promise<void>): Promise<void> {
    const answer = parseOwnerReply(text)
    // Only a coded reply decides. Photon's payload has no service field (iMessage vs SMS), so a bare
    // reply can't be told from an SMS spoof; the code reached nobody but the owner.
    if (answer.kind === 'unrecognised' || !answer.code) {
      await reply(helpText(notified(await listPendingApprovals(db()))))
      return
    }
    const target = await findApprovalByCode(db(), answer.code)
    if (!target) {
      await reply(unknownCodeText(answer.code))
      return
    }
    // Commit first: the workflow settles from the database, so a decision is never lost even if
    // everything below fails.
    const decided = await decideApproval(db(), target.id, {
      status: answer.status,
      actor: OWNER_ACTOR,
      reasoning: `${answer.status === 'approved' ? 'Approved' : 'Denied'} via iMessage`,
    })
    const plan = planDecision(answer.status, decided, decided ? null : await getApproval(db(), target.id))
    if (plan.error) console.error(`[photon] ${plan.error}`)
    if (plan.deliverTo) await deliver(plan.deliverTo, target.id, answer.status)
    await reply(plan.reply)
  }
  ```
- [ ] **Step 5: Implement `apps/agents/agent/channels/photon.ts`.** It follows the reference's `agent/channels/photon.ts` and eve's "Other hosts" example:
  ```ts
  import { photonIMessageChannel } from 'eve/channels/photon'
  import { photonCredentials } from '../lib/imessage'
  import { handleOwnerMessage } from '../lib/photon-inbound'

  // Read when the module loads, as eve's Photon example does (the one env read outside getEnv): the
  // channel needs it at construction. Unset (including at build time), every delivery is rejected,
  // instead of eve falling back to Vercel OIDC, which this self-hosted app doesn't use.
  const webhookSecret = process.env.IMESSAGE_WEBHOOK_SECRET?.trim()

  /**
   * iMessage through Photon: the owner's replies to approval requests. Reached only through the web
   * app's forwarder (`/api/twin/hooks/photon`), like the other webhooks; the adapter verifies the
   * `X-Spectrum-Signature` HMAC itself.
   */
  export default photonIMessageChannel({
    credentials: photonCredentials,
    route: '/webhooks/photon',
    ...(webhookSecret ? { webhookSecret } : { webhookVerifier: () => false }),
    onMessage: handleOwnerMessage,
  })
  ```
- [ ] **Step 6: Remove the Sendblue route.** In `apps/agents/agent/channels/webhooks.ts`:
  - delete the `handleSendblueWebhook` import and the `POST('/webhooks/sendblue', …)` route;
  - change the channel JSDoc's opening to "Inbound Cal.com booking webhooks, reached only through the web app's allow-listed forwarder. The webhook verifies its own signature here, next to the secret (spec §2). Photon owner replies have their own channel (`photon.ts`)."

  Then delete the three files, one command each:
  - `git rm apps/agents/agent/lib/sendblue-webhook.ts`
  - `git rm apps/agents/tests/sendblue-webhook.test.ts`
  - `git rm apps/agents/agent/lib/secrets.ts`

  Run them only after `git grep -n secretsEqual` shows no importer besides `sendblue-webhook.ts`. If `tests/secrets.test.ts` exists, `git rm` it too.
- [ ] **Step 7: Leftovers.**
  - `owner-decision.ts`: the `DecisionPlan` JSDoc becomes "What the Photon inbound handler does once it has tried to commit the owner's reply."
  - `webhook-utils.ts`: in the `bestEffort` JSDoc, the example `sendblue reply` becomes `photon reply`.
  - `tests/integration-gating.test.ts`: replace the four `SENDBLUE_*` keys with the four Photon keys from `IMESSAGE_ENV` above, keeping `OWNER_PHONE_NUMBER`.
  - `tests/request-disclosure-body.test.ts`: `'sendblue down'` becomes `'photon down'`, and in the regex `imessage|sendblue` becomes `imessage|photon`.
  - `tests/approval-steps.test.ts`: `'sendblue down'` becomes `'photon down'`, twice.
- [ ] **Step 8: Run:**
  - `bun run --cwd apps/agents test tests/photon-inbound.test.ts` should PASS;
  - `bun run --cwd apps/agents test` should be all green;
  - `bun run --cwd apps/agents check-types` should be clean;
  - `git grep -n -i sendblue -- apps/agents/agent apps/agents/tests packages/twin/src packages/twin/tests` must print nothing.
- [ ] **Step 9: eve sees the channel.** Run `bun run --cwd apps/agents info`. It should report 0 diagnostics. Then run `grep -o -E '"/webhooks/[a-z]+"' apps/agents/.eve/compile/compiled-agent-manifest.json`: it must list `/webhooks/photon` and `/webhooks/cal`, and no `/webhooks/sendblue`. If the photon route lives in a different manifest key, grep `apps/agents/.eve` for `webhooks/photon` and report where it is.
- [ ] **Step 10: Commit** (WIP): `git add apps/agents/agent apps/agents/tests`. The deletions are already staged. Then `git commit -m "wip(agents): T3 owner replies through eve's Photon channel" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

---

### Task 4: web forwarder

**Files:** Modify `apps/web/app/api/twin/hooks/[provider]/route.ts` and `apps/web/tests/unit/twin/hooks-route.test.ts`.

- [ ] **Step 1: Tests first.** In `hooks-route.test.ts`:
  1. Replace the test `'forwards the Sendblue body and signing secret, and nothing else'` with:
     ```ts
     it('forwards the Photon body and Spectrum signature headers, and nothing else', async () => {
       vi.stubEnv('TWIN_AGENT_URL', 'http://agent')
       const seen: Array<{ url: string; init: RequestInit }> = []
       vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
         seen.push({ url, init })
         return new Response(null, { status: 200 })
       }))
       const { POST } = await import('@/app/api/twin/hooks/[provider]/route')
       const body = '{"event":"messages","message":{"id":"spc-msg-1"}}'
       const headers = {
         'content-type': 'application/json',
         'x-spectrum-signature': 'v0=abc',
         'x-spectrum-timestamp': '1790000000',
         'x-spectrum-event': 'messages',
         'x-spectrum-webhook-id': 'wh-1',
         cookie: 'x=y',
         authorization: 'Bearer t',
       }
       const res = await POST(new Request('http://web/api/twin/hooks/photon', { method: 'POST', body, headers }), { params: Promise.resolve({ provider: 'photon' }) })
       expect(res.status).toBe(200)
       expect(seen[0]?.url).toBe('http://agent/webhooks/photon')
       expect(seen[0]?.init.body).toBe(body)
       const forwarded = new Headers(seen[0]?.init.headers)
       expect(forwarded.get('content-type')).toBe('application/json')
       expect(forwarded.get('x-spectrum-signature')).toBe('v0=abc')
       expect(forwarded.get('x-spectrum-timestamp')).toBe('1790000000')
       expect(forwarded.get('x-spectrum-event')).toBe('messages')
       expect(forwarded.get('x-spectrum-webhook-id')).toBe('wh-1')
       expect(forwarded.get('cookie')).toBeNull()
       expect(forwarded.get('authorization')).toBeNull()
     })
     ```
  2. Replace `'relays the agent status and body for Sendblue'` with the same test using `/api/twin/hooks/photon`, `provider: 'photon'`, and the name `'relays the agent status and body for Photon'`.
  3. Change the 404 list to `['github', 'telegram', 'sendblue', 'constructor', '__proto__', 'toString']`.
- [ ] **Step 2: Run** `bun run --cwd apps/web test tests/unit/twin/hooks-route.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `route.ts`, replace the `sendblue:` line with:
  ```ts
  photon: ['content-type', 'x-spectrum-signature', 'x-spectrum-timestamp', 'x-spectrum-event', 'x-spectrum-webhook-id'],
  ```
  In the JSDoc, "Cal.com and Sendblue webhooks" becomes "Cal.com and Photon webhooks".
- [ ] **Step 4: Run.** `bun run --cwd apps/web test tests/unit/twin/hooks-route.test.ts` should PASS, and `bun run --cwd apps/web check-types` should be clean.
- [ ] **Step 5: Commit:** `git add "apps/web/app/api/twin/hooks/[provider]/route.ts" apps/web/tests/unit/twin/hooks-route.test.ts`, then `git commit -m "feat(web): forward Photon webhooks instead of Sendblue" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

---

### Task 5: fixtures, CI, compose, deploy env, bundle scan

**Files:** see the file map row for T5.

- [ ] **Step 1: Offline evals.** Photon speaks gRPC to Spectrum Cloud, so there is no HTTP stub; iMessage stays unconfigured offline.
  1. `apps/agents/fixtures/offline/stubs/start.ts`: start only `startPayloadMcpStub(4310)`, and drop the Sendblue import. Keep the returned closer's shape.
  2. `git rm apps/agents/fixtures/offline/stubs/sendblue.ts`.
  3. `apps/agents/fixtures/offline/.env.example`: delete the six lines `SENDBLUE_API_BASE`, `SENDBLUE_API_KEY`, `SENDBLUE_API_SECRET`, `SENDBLUE_FROM_NUMBER`, `SENDBLUE_WEBHOOK_SECRET` and `OWNER_PHONE_NUMBER`. Add no iMessage variables.
  4. The gitignored `apps/agents/fixtures/offline/.env`: delete the same six lines with `sed -i` on the variable names, without printing the file. Then confirm with `grep -c -E "^(SENDBLUE_|OWNER_PHONE_NUMBER)" apps/agents/fixtures/offline/.env`, which must print `0`.
- [ ] **Step 2: CI.** In `.github/workflows/ci.yml`, replace `SENDBLUE_WEBHOOK_SECRET: ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-55` with two lines:
  ```yaml
  IMESSAGE_PROJECT_SECRET: ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-55
  IMESSAGE_WEBHOOK_SECRET: ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-88
  ```
  Each suffix must be unique among the neighbouring literals. Then validate the YAML by parsing it.
- [ ] **Step 3: Bundle scan.** In `scripts/scan-client-bundle.ts`, replace the three `SENDBLUE_*` names with `'IMESSAGE_PROJECT_SECRET', 'IMESSAGE_WEBHOOK_SECRET',`. In `scripts/scan-client-bundle.test.ts`, `'SENDBLUE_WEBHOOK_SECRET'` becomes `'IMESSAGE_WEBHOOK_SECRET'`. Run `bun test scripts/scan-client-bundle.test.ts`: PASS.
- [ ] **Step 4: Compose.** In `docker-compose.yml`'s `agents` environment, replace the five `SENDBLUE_*` lines and `OWNER_PHONE_NUMBER` with:
  ```yaml
  IMESSAGE_PROJECT_ID: ${IMESSAGE_PROJECT_ID:-}
  IMESSAGE_PROJECT_SECRET: ${IMESSAGE_PROJECT_SECRET:-}
  IMESSAGE_WEBHOOK_SECRET: ${IMESSAGE_WEBHOOK_SECRET:-}
  OWNER_PHONE_NUMBER: ${OWNER_PHONE_NUMBER:-}
  ```
  Blank values are safe: `parseEnv` turns blank into unset. The channel file trims `IMESSAGE_WEBHOOK_SECRET` and treats blank as unset.
- [ ] **Step 5: `.env.deploy.example`.** Replace the iMessage/Sendblue block with:
  ```
  # --- iMessage owner approvals via Photon (optional; leave all blank to disable) ---
  # app.photon.codes > your project: project id and project secret.
  IMESSAGE_PROJECT_ID=
  IMESSAGE_PROJECT_SECRET=
  # Signing secret Photon shows once when you create the webhook for https://<web>/api/twin/hooks/photon.
  IMESSAGE_WEBHOOK_SECRET=
  # Your own phone number, E.164. Only replies from it decide approvals; text the Photon line once from it.
  OWNER_PHONE_NUMBER=
  ```
- [ ] **Step 6: Check.**
  - `git grep -n -i sendblue -- .github docker-compose.yml .env.deploy.example scripts apps/agents/fixtures apps/agents/evals` prints nothing.
  - `bun run --cwd apps/agents check-types` is clean.
  - `bun run --cwd apps/agents test` is green.
- [ ] **Step 7: Commit:** `git add apps/agents/fixtures/offline/stubs apps/agents/fixtures/offline/.env.example .github/workflows/ci.yml docker-compose.yml .env.deploy.example scripts/scan-client-bundle.ts scripts/scan-client-bundle.test.ts`, then `git commit -m "chore(ci): Photon env replaces Sendblue; offline evals leave iMessage off" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`. Never stage the gitignored `.env`.

---

### Task 6: documentation

**Files:** `apps/agents/README.md`, `apps/agents/.env.example`, `docs/deploy-easypanel.md`, `docs/superpowers/plans/2026-10-05-imessage-owner-approvals.md`.

- [ ] **Step 1: `apps/agents/.env.example`.** Replace the `# --- iMessage via Sendblue (owner approvals) ---` block with the T5 Step 5 block, under the heading `# --- iMessage via Photon (owner approvals) ---`. Keep `TWIN_APPROVAL_TIMEOUT` and its comment.
- [ ] **Step 2: README.** Replace every Sendblue statement with the Photon equivalent from the spec:
  - **Diagram:** `Photon ─ webhook ──► web /api/twin/hooks/photon ──(raw body + x-spectrum-*)──► agents /webhooks/photon (eve photon channel)`.
  - **Env table:** the four `imessage` rows, and no `SENDBLUE_API_BASE`.
  - **"iMessage approvals" section:**
    - the prompt;
    - **only coded replies decide**, and a bare YES/NO gets the help text, with the reason: Photon's payload has no service field (iMessage vs SMS), so an SMS spoof can't be excluded;
    - owner-only, strangers ignored, late replies;
    - the 5 setup steps from the spec's "Setup (owner)";
    - why it's built this way: inbound is eve's Photon channel as in the personal-agent-template reference, with `onMessage` returning `null`, so no agent turn starts; outbound is the provider API, per eve's durable cross-channel notifications page.
  - **File map:** `agent/channels/photon.ts`, `agent/lib/photon-inbound.ts` and `agent/lib/imessage.ts` replace `sendblue-webhook.ts`.
  - **Testing/CI text:** the offline evals leave iMessage unconfigured.
  - Keep the entry under "Where the code differs from the spec", and update it to say iMessage via Photon.
- [ ] **Step 3: `docs/deploy-easypanel.md`.** Replace the Sendblue mentions:
  - the forwarder URL list becomes `/api/twin/hooks/cal` and `/api/twin/hooks/photon`;
  - the env table row lists the four Photon variables (optional, all or none);
  - step 6.3 becomes the spec's 5 setup steps;
  - troubleshooting "iMessage approvals always expire" checks:
    - the webhook points at `/api/twin/hooks/photon` with the matching signing secret;
    - `OWNER_PHONE_NUMBER` is in E.164;
    - your iPhone starts conversations from your phone number;
    - you texted the Photon line once;
    - the agent logs show no `Photon send failed`;
    - you replied with the code, since bare YES/NO only returns the help text.
- [ ] **Step 4: Old plan.** At the top of `docs/superpowers/plans/2026-10-05-imessage-owner-approvals.md`, under its title, add:
  `> Superseded on 2026-10-05 by [2026-10-05-photon-owner-approvals.md](2026-10-05-photon-owner-approvals.md): the transport is Photon, not Sendblue. Kept as the record of the Sendblue tasks that preceded it on this branch.`
- [ ] **Step 5: Check and commit.** `git grep -n -i sendblue -- apps/agents/README.md apps/agents/.env.example docs/deploy-easypanel.md` should print only deliberate history notes, if any. Then `git add apps/agents/README.md apps/agents/.env.example docs/deploy-easypanel.md docs/superpowers/plans/2026-10-05-imessage-owner-approvals.md`, and `git commit -m "docs(agents): iMessage approvals via Photon" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

---

### Task 7: final verification (controller)

- [ ] Run every suite and type-check: packages/twin, apps/agents and apps/web (tests and `check-types`). Then run `bun test scripts/scan-client-bundle.test.ts`.
- [ ] Run `bun run --cwd apps/agents info`. It should report 0 diagnostics, list the `/webhooks/photon` route, and show no Sendblue.
- [ ] Run the worktree's agents server on port 4200 against a clone of `twin_eval`, with dummy Photon variables. An unsigned `POST /webhooks/photon` must be rejected (non-2xx), and no Photon call may be made.
- [ ] Run `git grep -n -i sendblue`. It should print only the spec's history paragraph and the superseded plan.
