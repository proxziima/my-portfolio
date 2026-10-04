import type { ReactNode } from 'react'

/** Messenger's small chrome glyphs, drawn rather than shipped as bitmaps. All decorative: text always sits beside them. */
function Glyph({ size, viewBox, children }: { size: number; viewBox: string; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox={viewBox} aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}

/** The ▾ after a menu-like line: the status and the personal message. */
export const Caret = () => (
  <Glyph size={8} viewBox="0 0 8 8">
    <path d="M1 3h6L4 6.5z" fill="#4d6a8a" />
  </Glyph>
)

/** The gold star of the Favorites heading. */
export const Star = () => (
  <Glyph size={15} viewBox="0 0 16 16">
    <defs>
      <linearGradient id="msn-star" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffe68a" />
        <stop offset="1" stopColor="#f2b01e" />
      </linearGradient>
    </defs>
    <path d="M8 1.2l2 4.3 4.7.5-3.5 3.2 1 4.6L8 11.5l-4.2 2.3 1-4.6L1.3 6l4.7-.5z" fill="url(#msn-star)" stroke="#c98a12" strokeWidth="0.8" strokeLinejoin="round" />
  </Glyph>
)

export const Magnifier = () => (
  <Glyph size={13} viewBox="0 0 14 14">
    <circle cx="5.5" cy="5.5" r="3.8" fill="none" stroke="#5a7896" strokeWidth="1.4" />
    <path d="M8.4 8.4l4 4" stroke="#5a7896" strokeWidth="1.8" strokeLinecap="round" />
  </Glyph>
)

/** The toolbar's "add a contact": a buddy with a green plus. */
export const AddContact = () => (
  <Glyph size={18} viewBox="0 0 18 18">
    <circle cx="7" cy="5" r="3.2" fill="#6fbf4a" />
    <path d="M1.5 15c0-3.6 2.5-5.8 5.5-5.8s5.5 2.2 5.5 5.8z" fill="#4f9f31" />
    <circle cx="13.5" cy="12.5" r="3.8" fill="#ffffff" stroke="#3b8a24" strokeWidth="1" />
    <path d="M13.5 10.6v3.8M11.6 12.5h3.8" stroke="#3b8a24" strokeWidth="1.4" />
  </Glyph>
)

/** The toolbar's "show menu": a small window. */
export const Menu = () => (
  <Glyph size={16} viewBox="0 0 16 16">
    <rect x="2.5" y="1.5" width="11" height="13" rx="1" fill="#f4f8fc" stroke="#5a7896" />
    <path d="M4.5 4.5h7M4.5 7h7M4.5 9.5h7M4.5 12h4" stroke="#5a7896" />
  </Glyph>
)

/** The toolbar's "change layout": stacked rows. */
export const Layout = () => (
  <Glyph size={16} viewBox="0 0 16 16">
    <rect x="1.5" y="2.5" width="9" height="11" rx="1" fill="#f4f8fc" stroke="#5a7896" />
    <path d="M3.5 5.5h5M3.5 8h5M3.5 10.5h5" stroke="#5a7896" />
    <path d="M12 6h3.5l-1.75 2.2z" fill="#4d6a8a" />
  </Glyph>
)

/** The inbox tray at the header's right, under its count. */
export const Inbox = () => (
  <Glyph size={30} viewBox="0 0 30 30">
    <defs>
      <linearGradient id="msn-tray" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffe9a8" />
        <stop offset="1" stopColor="#e6b84a" />
      </linearGradient>
    </defs>
    <path d="M6 4h16l3 4v6H3V8z" fill="#f7fbff" stroke="#8aa4bf" />
    <path d="M7 7h14M7 10h14" stroke="#b9cbe0" />
    <path d="M2 14h8l1.5 3h7L20 14h8v10H2z" fill="url(#msn-tray)" stroke="#b8872a" />
  </Glyph>
)
