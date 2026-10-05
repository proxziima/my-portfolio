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
 * Durable, asynchronous owner approval for restricted items (spec §8). A `task`, so the
 * conversation continues; a webhook race against `sleep` is eve's documented deadline pattern.
 * Static, as workflow tools can't be dynamic; the portfolio-recall skill (always active) owns it.
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
    const approvalId = await openApproval(ctx.session.id, input)
    const decision = createWebhook()
    await notifyOwner(approvalId, decision.url, input)
    const timeout = await approvalTimeout()
    const arrived = await Promise.race([decision, sleep(timeout)])
    const status = await finalizeApproval(ctx.session.id, approvalId, arrived === undefined)
    if (status !== 'approved') return { status }
    return { status, item: await discloseItem(input.sourceId) }
  },
  toModelOutput: (o) => ({ type: 'text', value: disclosureForModel(o, untrustedKey()) }),
})
