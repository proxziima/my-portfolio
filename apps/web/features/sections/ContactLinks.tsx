import type { LinkItem } from '@/lib/cms/types'
import { ChipLink } from '@/shared/ui/ChipLink'

export function ContactLinks({ links }: { links: LinkItem[] }) {
  if (links.length === 0) return null
  return (
    <nav className="links" aria-label="Contact" data-anchor="links">
      {links.map((l) => <ChipLink key={`${l.href}|${l.label}`} chip={l.chip} label={l.label} href={l.href} />)}
    </nav>
  )
}
