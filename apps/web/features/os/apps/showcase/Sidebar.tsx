'use client'
import { NavLink } from './NavLink'
import type { NavItem, ShowcasePage } from './pages'

/** The reference stacks first and last name on two lines: split on the last space (a lone word keeps line two empty). */
export function splitName(name: string): [string, string] {
  const trimmed = name.trim()
  const at = trimmed.lastIndexOf(' ')
  return at === -1 ? [trimmed, ''] : [trimmed.slice(0, at).trim(), trimmed.slice(at + 1)]
}

interface Props {
  name: string
  items: NavItem[]
  page: ShowcasePage
  onNavigate: (page: ShowcasePage) => void
}

/** The reference's VerticalNavbar: the name, "Showcase 'YY", and the page links centred below. */
export function Sidebar({ name, items, page, onNavigate }: Props) {
  const [first, last] = splitName(name)
  const year = String(new Date().getFullYear()).slice(-2)
  return (
    <nav className="sidebar" aria-label="Showcase">
      <div className="sidebarHeader">
        <h1>{first}</h1>
        {last && <h1>{last}</h1>}
        <h3>Showcase &apos;{year}</h3>
      </div>
      <div className="sidebarLinks">
        {items.map((item) => (
          <NavLink key={item.page} label={item.label} current={item.page === page} onNavigate={() => onNavigate(item.page)} />
        ))}
      </div>
      <div className="sidebarSpacer" />
    </nav>
  )
}
