import { type Visitor, VisitorPatch, type VisitorPatchInput } from '@repo/twin/contract'

/**
 * Merges what the visitor volunteered over what is stored. The patch is sanitised first with the
 * contract's rules, and only fields still defined afterwards are merged, so junk input (say `'<>'`)
 * can never erase a good stored value.
 */
export function mergeVisitor(stored: Visitor, patch: VisitorPatchInput): Visitor {
  const clean = VisitorPatch.parse(patch)
  const defined = Object.fromEntries(Object.entries(clean).filter(([, v]) => v !== undefined))
  return { ...stored, ...defined }
}
