# Owner approvals over iMessage (Photon) instead of Telegram

**Status:** approved by the owner on 2026-10-05 ("switch to Photon … use the personal-agent-template as reference … don't invent anything"). This revision replaces the Sendblue design that preceded it on the same branch: Sendblue's free sandbox has no receive webhooks and no outbound sends, so the flow could not run without the $100/month plan, while Photon's free tier covers it.
**Supersedes:** the Telegram parts of [the twin spec](2026-10-04-portfolio-twin-agent-design.md) §6 (`request_disclosure`, owner approval transport). Everything else there is unchanged: the approval is a durable `task` that races a workflow webhook against `sleep`, the database is the source of truth, and every failure denies.

## Goal

The owner approves or denies restricted disclosures from iMessage, through Photon, instead of Telegram. The integration stays optional: without it the twin works and offers nothing restricted.

## Sources (read, not recalled)

- **The reference, `vercel-labs/personal-agent-template`, `agent/channels/photon.ts`.** It reaches iMessage through eve's first-class channel: `photonIMessageChannel` from `eve/channels/photon`. Its `onMessage(_ctx, message)`:
  - returns `null` for `message.author.isBot`;
  - normalises `message.author.userId` to E.164 with `asPhoneNumber` ("iMessage handles are phone numbers or Apple IDs; only the former can match a profile");
  - maps a known number to an identity, and answers anyone else as a stranger with no access.
  The reference has no owner-approval flow over iMessage: its approvals are eve's in-session tool approvals for the same user.
- **eve 0.71 docs, `docs/channels/photon.mdx`.** Off Vercel ("Other hosts"), the channel takes lazy `credentials()` returning `{ projectId, projectSecret }` from `IMESSAGE_PROJECT_ID` and `IMESSAGE_PROJECT_SECRET`, and `webhookSecret` from `IMESSAGE_WEBHOOK_SECRET`. `route` overrides the default `/eve/v1/photon`. "Return `null` to ignore a message."
- **eve 0.71 types and source, `photonIMessageChannel`.** `onMessage(ctx, message)` gets `ctx.thread`, a Chat SDK `Thread`. When it returns `null`, nothing else happens: no read receipt, no agent turn. Chat SDK routes a DM only to the direct-message handler, so each inbound message reaches `onMessage` once. Group messages reach it too, through eve's catch-all pattern handler.
- **eve 0.71 docs, `docs/patterns/durable-cross-channel-notifications.md`.** "To post a notification without a model call, use the destination platform's API instead." `to(channel, target).send(...)` would start an agent turn, which an approval prompt must not do.
- **`@photon-ai/chat-adapter-imessage` 3.2.0**, the adapter eve bundles for this channel (`eve/package.json`). It exports `createiMessageAdapter({ credentials })`, whose lazy provider makes construction safe at build time, and the two calls a notification needs:
  - `openDM(userId)`: "the bot can message a user it has never received from";
  - `postMessage(threadId, text)`.
  Sends build the Spectrum app on demand, without the Chat SDK runtime. Webhook deliveries are verified by `X-Spectrum-Signature` (HMAC-SHA256 of `v0:{timestamp}:{rawBody}`) and `X-Spectrum-Timestamp`, with a 5-minute tolerance.
- **Photon's webhook docs, the `messages` event.** The payload is `{ event, space: { id, platform, type: 'dm' | 'group', phone }, message: { id, direction: 'inbound', timestamp, sender: { id, platform }, content } }`. It carries **no service field (iMessage, SMS or RCS) and no delivery-attempt marker.** Retries keep the same `message.id`. Photon asks for an immediate 2xx and asynchronous processing, which the adapter already does.
- **Photon free tier:** a shared line pool, up to 10 users, unlimited daily messages. A shared line can only message a number after that number has texted it first. Your conversation keeps one stable number.

## Decision

Inbound is eve's Photon channel, configured exactly as the eve docs and the reference do. Its `onMessage` handles the owner's reply itself, deterministically, then returns `null`. Outbound is the provider API, per eve's cross-channel notification pattern, through the same adapter package eve bundles. The database, reply codes, reply texts and approval workflow from the Sendblue revision are transport-neutral and stay.

| Concern | Telegram (before) | iMessage via Photon (after) |
|---|---|---|
| Owner prompt | `sendMessage` with inline Approve/Deny buttons | `openDM(owner)`, then `postMessage` with text ending in "Reply YES K7Q2 to share or NO K7Q2 to decline" |
| Owner answer | `callback_query` tap | an inbound iMessage reply, parsed by a strict grammar in `onMessage` |
| Answer feedback | `answerCallbackQuery` plus `editMessageText` | one short confirmation through `ctx.thread.post` ("Approved K7Q2: Notice period.") |
| Webhook auth | `x-telegram-bot-api-secret-token` | the adapter verifies `X-Spectrum-Signature` with `IMESSAGE_WEBHOOK_SECRET` |
| Owner identity | `from.id === TELEGRAM_OWNER_USER_ID` | `message.author.userId`, normalised to E.164, equals `OWNER_PHONE_NUMBER` |
| Notified marker | `telegram_message_id` | `notified_at` |
| Expiry | buttons edited to "Expired" | no message (the prompt states the deadline); a late reply gets "K7Q2 already expired; nothing was shared." |

## Design

### Env: the `imessage` integration (replaces `telegram`)

Like every integration, the variables are all or nothing (`INTEGRATIONS` in `packages/twin/src/env.ts`). The names are Photon's, as eve and the adapter read them:

| Variable | Rule | Purpose |
|---|---|---|
| `IMESSAGE_PROJECT_ID` | non-empty | Photon (Spectrum Cloud) project id |
| `IMESSAGE_PROJECT_SECRET` | non-empty | Photon project secret |
| `IMESSAGE_WEBHOOK_SECRET` | non-empty | the signing secret Photon returns, once, when the webhook is created |
| `OWNER_PHONE_NUMBER` | E.164 | the only number whose replies count, and the number the prompt is sent to |

### Data: `approvals` (migration 0002, unchanged from the Sendblue revision)

- **Drop `telegram_message_id`.**
- **Add `notified_at timestamptz`.** It is set once the owner has been texted, and is the idempotency marker for the notify step. `setApprovalNotified` sets it once: a later call does not move it.
- **Add `reply_code text NOT NULL`:**
  - 4 characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, an alphabet with no 0/O or 1/I/L;
  - unique among pending rows through the partial unique index `approvals_pending_code_uq ON (reply_code) WHERE status = 'pending'`;
  - assigned in `createApproval`, which retries with a fresh code on a collision on that index (5 attempts, then it throws).
- **`findApprovalByCode(code)`** returns the pending row with that code, or the most recent settled row with that code from the last 24 hours, so a late reply gets the right message.
- **`listPendingApprovals()`** returns all pending rows, oldest first. It feeds the help text.
- **The migration** was generated with drizzle-kit and edited for the backfill. Existing rows get a code of 4 hex characters derived from `md5(id)`. `notified_at` is backfilled only for settled rows that had a Telegram message. A pglite test and a run on a clone of the local Postgres prove it.

### Reply grammar (`agent/lib/imessage-reply.ts`, pure, unchanged)

The text is trimmed, upper-cased and stripped of trailing punctuation. Then:

- `^(YES|Y|APPROVE|OK) ([A-Z0-9]{4})$` approves the code, and `^(NO|N|DENY) ([A-Z0-9]{4})$` denies it.
- **Only a coded reply decides.** A bare `YES`/`NO`, or anything else, gets the help text: "Reply YES <code> or NO <code>. Waiting: K7Q2 (Notice period).", listing up to 3 notified codes with topics. The Sendblue revision let a bare reply decide when it was unambiguous. Its two guards came from Sendblue's `service` and `date_sent` fields, and Photon's payload has neither. Without them, a bare reply can't be told apart from:
  - **a spoof.** SMS sender ids can be forged, and a forged bare `YES` would meet exactly the conditions a visitor's own request creates;
  - **a retried old answer** landing on a newer approval.
  The code is a secret that only reached the owner, so a coded reply is safe on every path.
- No AI reads owner texts, so no prompt injection is possible.

### Inbound: `agent/channels/photon.ts` and `agent/lib/photon-inbound.ts`

The channel file follows the reference and eve's "Other hosts" example:

- `photonIMessageChannel({ credentials, route: '/webhooks/photon', webhookSecret | webhookVerifier, onMessage })`.
- `credentials()` is lazy, so eve's build-time module evaluation never needs secrets. It returns the project id and secret from the `imessage` integration and throws when the integration is off.
- `webhookSecret` is `IMESSAGE_WEBHOOK_SECRET`, read when the module loads, as eve's example does. When it is unset, the channel gets `webhookVerifier: () => false`, which rejects every delivery. Without it, eve would fall back to Vercel OIDC, which this self-hosted app does not use.
- `route: '/webhooks/photon'` keeps the agent's webhooks under one prefix, behind the web forwarder like Cal.com's.

`handleOwnerMessage(ctx, message)` in `agent/lib/photon-inbound.ts` always returns `null`, so no agent turn ever starts on this channel:

1. Ignore the message when any of these hold:
   - the `imessage` integration is off;
   - `message.author.isBot` (the reference's rule);
   - `message.author.isMe`;
   - `ctx.thread.isDM` is false, i.e. a group message.
2. Ignore it when `toE164(message.author.userId)` isn't `OWNER_PHONE_NUMBER`. This follows the reference's rule that only a phone number can match. Unlike the reference, which answers strangers, the twin never answers them: the line exists for owner approvals, and the twin's public conversation is the web Messenger. One log line is written, without the number.
3. Parse `message.text`. If the reply is unrecognised or has no code, reply with the help text.
4. `findApprovalByCode(code)`. If no row matches, reply "No approval ZZZZ is waiting."
5. Then, in order:
   - `decideApproval(id, { actor: 'imessage:owner', reasoning: 'Approved via iMessage' | 'Denied via iMessage' })`, which commits first;
   - `planDecision`;
   - `deliver(webhook)`;
   - the confirmation text.
   Replies go through `ctx.thread.post`, best effort: a failure is logged, never rethrown.
6. **A database failure** is caught. Photon has already been answered with 200 (the adapter acknowledges before processing), so nothing would redeliver it. The handler logs the failure and replies "That reply could not be recorded. Send it again." If the owner doesn't resend, the approval auto-denies, which is fail-closed.
7. **A retried delivery** (same `message.id`, or the owner sending the same coded reply twice) is safe to repeat. `decideApproval` only moves a pending row, and `planDecision` re-delivers and re-confirms the owner's own matching decision.

### Outbound: `agent/lib/imessage.ts`

- One lazily built adapter per process: `createiMessageAdapter({ credentials })`, with the same lazy provider as the channel.
- `sendToOwner(text)`:
  - **Integration off:** throws `FatalError('iMessage is not configured')`, since no retry would make the configuration appear before the approval expires.
  - **Otherwise:** it calls `openDM(OWNER_PHONE_NUMBER)`, then `postMessage(threadId, text)`, and returns the sent message id.
  - **Any adapter error** is rethrown as `Error('Photon send failed', { cause })`. That keeps it retryable by the workflow step: the adapter exposes no classification of permanent errors to build on. Messages never contain secrets.
- The notify step builds the text with `requestText(row, timeout)` from the row only (CMS topic, source id, reply code, timeout), never from the model's reason:
  `Twin approval request\nTopic: <topic>\nItem: <sourceId>\nReply YES <code> to share or NO <code> to decline. Auto-denies after <timeout>.`

### Web forwarder

`apps/web/app/api/twin/hooks/[provider]` replaces `sendblue` with `photon`. It forwards `content-type`, `x-spectrum-signature`, `x-spectrum-timestamp`, `x-spectrum-event` and `x-spectrum-webhook-id`, and the raw body, to agents `/webhooks/photon`. Register `https://<web>/api/twin/hooks/photon` as the Photon webhook for the `messages` event, and store its signing secret as `IMESSAGE_WEBHOOK_SECRET`.

### Setup (owner)

1. Create a Photon project at app.photon.codes (free tier) and copy the project id and secret.
2. Create a webhook for `https://<web>/api/twin/hooks/photon` and copy its signing secret. It is shown once.
3. Set the four variables.
4. Text the Photon line once from your iPhone. A shared line can only message a number that has texted it first.
5. Set iPhone Settings > Messages > Send & Receive > "Start New Conversations From" to your phone number. An Apple ID email can't match `OWNER_PHONE_NUMBER`.

### Unchanged

The tool contract, the caps (3 per session, one per item), the offered-stub check, the 15-minute auto-deny, fail-closed handling, the search filtering when the integration is off (keyed on `imessage`), and the visitor-facing behaviour.

## Testing

- **Pure units:**
  - the reply grammar;
  - E.164 normalisation;
  - `planDecision`.
- **`sendToOwner`, against a mocked adapter module:**
  - `openDM` gets the owner's number and `postMessage` gets the text;
  - the credentials provider returns the project's credentials;
  - an unconfigured integration throws `FatalError` without touching the adapter;
  - an adapter error is retryable, carries its cause, and leaks no secret.
- **`handleOwnerMessage`, with a fake thread and mocked queries:**
  - integration off, a bot, `isMe`, a group, a stranger and an Apple ID are each ignored, with no post and no number in any log;
  - the owner's number in another format is accepted;
  - approve, deny, a late reply, an unknown code, and a redelivery that is delivered again and confirmed again;
  - a bare `yes`, even with exactly one approval pending, gets the help text and decides nothing; so does `maybe`;
  - a failing post leaves the decision committed;
  - a database failure is logged and the owner is asked to resend, and the handler doesn't throw;
  - it always returns `null`.
- **pglite:** the migration, reply-code uniqueness and retries, `findApprovalByCode`, `listPendingApprovals`. These are unchanged.
- **The web forwarder:** the photon headers are forwarded, others are dropped, and unknown or prototype-key providers get 404.
- **`eve info`** registers the photon channel route `/webhooks/photon`.
- **Offline evals:** Photon speaks gRPC to Spectrum Cloud, so there is no HTTP stub to point it at. The offline and CI evals leave iMessage unconfigured, as the live CI evals already do, and restricted entries are never offered there.
- **Env tests:** the `imessage` group, plus a half-set group that fails.

## Out of scope

- Talking to the twin over iMessage (an agent turn on this channel).
- Bare YES/NO decisions. They need a sender-authenticity signal and a send time that Photon's webhook doesn't carry. They can return if Photon adds them.
- Tapback approvals. Reactions reach the adapter, but not `onMessage`.
