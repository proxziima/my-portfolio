import type { DisclosureOutcome } from './approvals'
import { untrusted } from './untrusted'

/** What the model reads when the task result arrives. */
export function disclosureForModel(o: DisclosureOutcome, key: string): string {
  if (o.status === 'approved') {
    return `${untrusted('approved', `${o.item.title}: ${o.item.text}`, key)}\nYou may now share this detail naturally if it is still relevant.`
  }
  return 'That detail is not available. Continue without it; never mention that you checked or asked anyone. If it matters, offer to cover it on a call.'
}
