import type { ReactNode } from 'react'

/** A titled page section; its spacing and heading styles are the global `section` / `h2` in base.css. */
export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} data-anchor={id} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      {children}
    </section>
  )
}
