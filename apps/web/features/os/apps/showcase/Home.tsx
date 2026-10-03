'use client'
import { NavLink } from './NavLink'
import type { NavItem, ShowcasePage } from './pages'

interface Props {
  name: string
  title: string
  items: NavItem[]
  onNavigate: (page: ShowcasePage) => void
}

/** The reference's landing page: no sidebar, the name and role centred over a row of links. */
export function Home({ name, title, items, onNavigate }: Props) {
  return (
    <div className="home">
      <div className="homeHeader">
        <h1>{name}</h1>
        <h2>{title}</h2>
      </div>
      <div className="homeLinks">
        {items
          .filter((item) => item.page !== 'home')
          .map((item) => (
            <NavLink key={item.page} label={item.label} onNavigate={() => onNavigate(item.page)} />
          ))}
      </div>
    </div>
  )
}
