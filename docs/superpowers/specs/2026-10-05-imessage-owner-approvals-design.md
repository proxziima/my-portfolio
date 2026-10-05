# Owner approvals over iMessage (Sendblue) instead of Telegram

**Status:** approved by the owner's standing instruction to decide gaps without asking (2026-10-05).
**Supersedes:** the Telegram parts of [the twin spec](2026-10-04-portfolio-twin-agent-design.md) §8 (owner approval transport). Everything else in §8 is unchanged: the approval is a durable `task` that races a workflow webhook against `sleep`, the database is the source of truth, and every failure denies.

## Goal

The owner approves or denies restricted disclosures from iMessage, through Sendblue, instead of Telegram. The integration stays optional: without it the twin works and offers nothing restricted.

## Research summary

- **The personal-agent-template reference** reaches iMessage through eve's first-class Photon channel (`eve/channels/photon`). Its `onMessage` normalises the sender's handle to E.164 and maps a known phone number to an identity. A stranger is answered with no access.
- **eve documents Sendblue** as a Chat SDK integration (`eve add channel/chat-sdk-sendblue`, `chat-adapter-sendblue` 0.2.0, webhook `/eve/v1/sendblue`).
- **Both are conversational channels.** Every inbound message is dispatched to an agent session. Our approvals are not a conversation with the agent: the owner answers a prompt about *another* session (the visitor's). eve's HITL (`respond`) cannot help either, because it parks and resumes the *requesting* session through *its* channel, which is the visitor's Messenger window.
- **`chat-adapter-sendblue` 0.2.0 is unsuitable as the approval transport**, from its source:
  - it compares `sb-signing-secret` with `!==`, which is not constant-time;
  - it skips verification entirely when no secret is configured;
  - `createSendblueAdapter()` throws at module evaluation when the env is absent, which breaks optional integrations and eve's build-time module evaluation;
  - it needs a Chat SDK state store (Redis in production), which we do not run;
  - it ignores inbound tapbacks.

## Decision

Keep the reference's pattern of identity by phone number, and call Sendblue's REST API through the official `sendblue` SDK (3.x) from our existing webhooks channel. This keeps every guarantee the Telegram transport had. No Chat SDK channel and no Photon.

| Concern | Telegram (before) | iMessage via Sendblue (after) |
|---|---|---|
| Owner prompt | `sendMessage` with inline Approve/Deny buttons | `messages.send` text ending in "Reply YES K7Q2 to share or NO K7Q2 to decline" |
| Owner answer | `callback_query` tap | an inbound text reply, parsed by a strict grammar |
| Answer feedback | `answerCallbackQuery` plus `editMessageText` | one short confirmation text ("Approved K7Q2: Compensation") |
| Webhook auth | `x-telegram-bot-api-secret-token` | `sb-signing-secret` (a shared secret header), compared with `secretsEqual` |
| Owner identity | `from.id === TELEGRAM_OWNER_USER_ID` | normalised E.164 `from_number === OWNER_PHONE_NUMBER` |
| Notified marker | `telegram_message_id` | `notified_at` |
| Expiry | buttons edited to "Expired" | no message (the prompt states the deadline); a late reply gets "K7Q2 already expired; nothing was shared." |

## Design

### Env: the `imessage` integration (replaces `telegram`)

Like every integration, the variables are all or nothing (`INTEGRATIONS` in `packages/twin/src/env.ts`):

| Variable | Rule | Purpose |
|---|---|---|
| `SENDBLUE_API_KEY` | non-empty | `sb-api-key-id` |
| `SENDBLUE_API_SECRET` | non-empty | `sb-api-secret-key` |
| `SENDBLUE_FROM_NUMBER` | E.164 | the Sendblue line that texts the owner |
| `SENDBLUE_WEBHOOK_SECRET` | 16 to 256 characters of `[A-Za-z0-9_-]` | the value Sendblue sends in `sb-signing-secret` |
| `OWNER_PHONE_NUMBER` | E.164 | the only number whose replies count |

Outside the group, `SENDBLUE_API_BASE` defaults to `https://api.sendblue.co`. The offline evals point it at a stub, so it is passed to the SDK as `baseURL`.

### Data: `approvals` (migration 0002)

- **Drop `telegram_message_id`.**
- **Add `notified_at timestamptz`.** It is set once the owner has been texted, and is the idempotency marker for the notify step.
- **Add `reply_code text NOT NULL`:**
  - 4 characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, an alphabet with no 0/O or 1/I/L;
  - unique among pending rows through the partial unique index `approvals_pending_code_uq ON (reply_code) WHERE status = 'pending'`;
  - assigned in `createApproval`, which retries with a fresh code on a collision on that index (5 attempts, then it throws).
- **Add the query `findPendingByCode(code)`.** It returns the pending row with that code, or the most recent settled row with that code from the last 24 hours, so a late reply gets the right message.
- **Add the query `listNotifiedPending()`** for bare replies.
- **The migration is generated with drizzle-kit,** like 0000 and 0001. Existing local rows get a backfilled random code:
  - the `NOT NULL` is added after the backfill;
  - drizzle's generated SQL is edited for the backfill;
  - a pglite test proves it.

### Reply grammar (`agent/lib/imessage-reply.ts`, pure)

The text is trimmed, upper-cased and stripped of trailing punctuation. Then:

- `^(YES|Y|APPROVE|OK) ([A-Z0-9]{4})$` approves the code, and `^(NO|N|DENY) ([A-Z0-9]{4})$` denies it.
- A bare `YES`/`NO` is accepted only when exactly one approval is pending *and notified*. Otherwise the twin replies "Which one? Reply YES <code> or NO <code>." and lists up to 3 pending codes with topics.
- Anything else from the owner gets "Reply YES <code> or NO <code>." No AI is involved, so no prompt injection is possible.

### Inbound route `POST /webhooks/sendblue` (agent, in `agent/channels/webhooks.ts`)

1. The `imessage` integration is off → 404.
2. `sb-signing-secret` fails `secretsEqual` → 401.
3. The body fails the zod `SendblueInbound` schema (`content`, `from_number`, `is_outbound`, `status`, `message_handle`, optional `group_id`) → acknowledged with 200 and logged by issue paths only.
4. `is_outbound`, a status other than `RECEIVED`, a group message, or a sender other than `OWNER_PHONE_NUMBER` after normalisation → 200, logged without the number. Strangers are never answered: the reply would cost money and confirm the line is live.
5. Parse the text, then `decideApproval(id, { actor: 'imessage:owner', ... })`, then `planDecision`, which is reused unchanged except for the actor, then `deliver(webhook)`. Then send the confirmation text. Sends are best effort: they are logged, never rethrown.
6. A transient database failure throws, so the route returns 500 and Sendblue's documented retry on 5xx redelivers. A redelivery of the same decision by the same actor is re-delivered (the existing `planDecision` rule) and gets the same confirmation.

### Outbound (`agent/lib/imessage.ts`, replaces `telegram.ts`)

- **Client.** `new SendblueAPI({ apiKey, apiSecret, baseURL: SENDBLUE_API_BASE, maxRetries: 0, timeout: 10_000 })`. Retries belong to the workflow step, not the SDK.
- **Functions.** `sendToOwner(text)` returns the message handle; `sendApprovalRequest(approvalId)` builds the text from the row.
- **Error classes.** `APIError` 400, 401, 403 and 404 throw `FatalError`, which is permanent: bad credentials, or a number Sendblue refuses. 429, 5xx, timeouts and network errors stay retryable.
- **Messages never contain the secrets.** Errors are built from the status and Sendblue's `error_message` only.
- **Prompt text.** It is built from the row only (CMS topic, source id, reply code, timeout), never from the model's reason. This is unchanged from §8:
  `Twin approval request\nTopic: <topic>\nItem: <sourceId>\nReply YES <code> to share or NO <code> to decline. Auto-denies after <timeout>.`

### Web forwarder

`apps/web/app/api/twin/hooks/[provider]` replaces `telegram` with `sendblue`, forwarding the headers `['content-type', 'sb-signing-secret']`. Register `https://<web>/api/twin/hooks/sendblue` as the Sendblue **receive** webhook, with the same secret.

### Unchanged

The tool contract, the caps (3 per session, one per item), the offered-stub check, the 15-minute auto-deny, fail-closed handling, the search filtering when the integration is off (now keyed on `imessage`), and the visitor-facing behaviour.

## Testing

- **Pure units:**
  - the reply grammar (every accepted form, rejects, bare-reply ambiguity);
  - E.164 normalisation;
  - the error classification of `sendToOwner`, against a mocked SDK;
  - `planDecision` with the new actor.
- **pglite:**
  - the migration (backfill plus `NOT NULL`);
  - reply-code uniqueness and retry on a forced collision;
  - `findPendingByCode` for pending, recently settled and unknown codes.
- **Route handler with mocks:**
  - 404 off, 401 bad secret;
  - stranger ignored, outbound ignored;
  - approve, deny, late reply, bare reply with one pending and with two pending;
  - redelivery, and a transient database failure giving 500.
- **Offline evals:** a Sendblue stub replaces the Telegram stub (it records `/api/send-message` bodies and answers `{ status: 'QUEUED', message_handle }`). The existing approval evals assert the prompt text and the timeout path.
- **Env tests:** the `imessage` group, plus a half-set group that fails.

## Out of scope

- Talking to the twin over iMessage (a conversational channel).
- SMS or RCS fallback: replies from any service count, but the integration targets iMessage.
- Tapback approvals: the Sendblue webhook docs and the adapter don't document inbound reactions. They can be added later if confirmed.
