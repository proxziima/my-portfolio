import type { SelectField } from 'payload'

/** Who may learn a fact: anyone, only after the owner approves, or nobody (spec §10–11). */
export const DISCLOSURE_TIERS = ['public', 'restricted', 'never'] as const
export type DisclosureTier = (typeof DISCLOSURE_TIERS)[number]

/** The tier select shared by every collection the twin can read. Existing rows default to public. */
export const disclosureField = (): SelectField => ({
  name: 'disclosure',
  type: 'select',
  required: true,
  defaultValue: 'public',
  index: true,
  options: [
    { label: 'Public: the twin may share it', value: 'public' },
    { label: 'Restricted: needs my approval per conversation', value: 'restricted' },
    { label: 'Never: the twin never sees it', value: 'never' },
  ],
  admin: { position: 'sidebar' },
})

/** How strict a tier is. It fails closed: anything that is not a known tier (e.g. a missing value) counts as `never`. */
const strictness = (tier: DisclosureTier): number => {
  const rank = DISCLOSURE_TIERS.indexOf(tier)
  return rank === -1 ? DISCLOSURE_TIERS.length - 1 : rank
}

/** The stricter of two tiers: a fact is only as visible as the least visible thing it reveals. */
export const stricterTier = (a: DisclosureTier, b: DisclosureTier): DisclosureTier =>
  DISCLOSURE_TIERS[Math.max(strictness(a), strictness(b))]!
