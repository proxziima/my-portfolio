import type { NavItem } from '@/lib/cms/types'

export function FooterNav({ items, name }: { items: NavItem[]; name: string }) {
  return (
    <footer className="site-footer">
      <span>© {new Date().getFullYear()} {name}</span>
      {items.length > 0 && (
        <nav aria-label="Footer">
          {items.map((i) => (
            <a key={`${i.href}|${i.label}`} href={i.href} {...(i.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
              {i.label}
            </a>
          ))}
        </nav>
      )}
    </footer>
  )
}
