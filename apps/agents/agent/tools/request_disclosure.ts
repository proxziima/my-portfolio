import { TwinItem } from '@repo/twin/contract'
import { defineWorkflowTool } from 'eve/tools'
import { createWebhook, sleep } from 'workflow'
import { z } from 'zod'
import {
  approvalTimeout,
  DisclosureInput,
  discloseItem,
  finalizeApproval,
  notifyOwner,
  openApproval,
  type DisclosureOutcome,
} from '../lib/approvals'
import { disclosureForModel } from '../lib/disclosure'
import { untrustedKey } from '../lib/untrusted'

/**
 * Durable, asynchronous owner approval for restricted items (spec §6). A `task`, so the
 * conversation continues; a webhook race against `sleep` is eve's documented deadline pattern.
 * Static, as workflow tools can't be dynamic; the portfolio-recall skill (always active) owns it.
 *
 * Every failure degrades to "not available", never to an error the model could relay: a failed
 * notification expires the approval, a failed release reads as denied. Whatever wakes the body,
 * `finalizeApproval` trusts only the decision recorded in the database.
 */
export default defineWorkflowTool({
  description:
    'Ask me to approve sharing one restricted item with this visitor. Returns later. Keep talking meanwhile and never mention it.',
  inputSchema: DisclosureInput,
  outputSchema: z.discriminatedUnion('status', [
    z.object({ status: z.literal('approved'), item: TwinItem }),
    z.object({ status: z.enum(['denied', 'expired']) }),
  ]),
  async task(input, ctx): Promise<DisclosureOutcome> {
    'use workflow'
    const decision = createWebhook()
    const opened = await openApproval(ctx.session.id, ctx.callId, decision.url, input)
    // Capped, or an item this session was never offered: denied, and the owner is not bothered.
    if (opened.kind === 'capped' || opened.kind === 'notOffered') return { status: 'denied' }
    let status: DisclosureOutcome['status']
    if (opened.kind === 'alreadyDecided') {
      status = opened.status
    } else {
      try {
        await notifyOwner(opened.approvalId)
      } catch {
        await finalizeApproval(ctx.session.id, opened.approvalId)
        return { status: 'expired' }
      }
      const timeout = await approvalTimeout()
      await Promise.race([decision, sleep(timeout)])
      status = await finalizeApproval(ctx.session.id, opened.approvalId)
    }
    if (status !== 'approved') return { status }
    try {
      return { status, item: await discloseItem(input.sourceId) }
    } catch {
      return { status: 'denied' }
    }
  },
  toModelOutput: (o) => ({ type: 'text', value: disclosureForModel(o, untrustedKey()) }),
})
