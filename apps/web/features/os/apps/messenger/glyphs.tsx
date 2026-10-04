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

/** The small round button beside each Conversation picture (hide the picture). */
export const Collapse = () => (
  <Glyph size={14} viewBox="0 0 14 14">
    <circle cx="7" cy="7" r="6" fill="#f4f9fd" stroke="#7d98b3" />
    <path d="M4.5 5.8L7 8.3l2.5-2.5" fill="none" stroke="#4d6a8a" strokeWidth="1.3" />
  </Glyph>
)

/** The webcam under it. */
export const Webcam = () => (
  <Glyph size={14} viewBox="0 0 14 14">
    <circle cx="7" cy="6" r="4.6" fill="#3a6fb0" stroke="#24508a" />
    <circle cx="7" cy="6" r="2" fill="#bfe0ff" />
    <path d="M4 13h6l-1-2.5H5z" fill="#7d98b3" />
  </Glyph>
)

/** A Messenger emoticon: a yellow face with the given features. */
const Face = ({ children }: { children: ReactNode }) => (
  <Glyph size={20} viewBox="0 0 20 20">
    <circle cx="10" cy="10" r="8.5" fill="#ffd84a" stroke="#c99a12" />
    <ellipse cx="10" cy="6.5" rx="5" ry="2.6" fill="#fff6c4" opacity="0.8" />
    {children}
  </Glyph>
)

export const Smiley = () => (
  <Face>
    <circle cx="7" cy="8.5" r="1.2" fill="#5a3a00" />
    <circle cx="13" cy="8.5" r="1.2" fill="#5a3a00" />
    <path d="M6 12q4 4 8 0" fill="none" stroke="#5a3a00" strokeWidth="1.3" strokeLinecap="round" />
  </Face>
)

export const Wink = () => (
  <Face>
    <path d="M5.8 8.5h2.6" stroke="#5a3a00" strokeWidth="1.3" strokeLinecap="round" />
    <circle cx="13" cy="8.5" r="1.2" fill="#5a3a00" />
    <path d="M6 12q4 3.5 8 0" fill="none" stroke="#5a3a00" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M10.5 13.2q1.5 2.2 3 .2" fill="#e8564a" />
  </Face>
)

/** The nudge: a face shaking. */
export const Nudge = () => (
  <Face>
    <path d="M6 8l2 1M14 8l-2 1" stroke="#5a3a00" strokeWidth="1.3" strokeLinecap="round" />
    <ellipse cx="10" cy="13" rx="2" ry="1.6" fill="#5a3a00" />
    <path d="M1 6q-1 4 0 8M19 6q1 4 0 8" fill="none" stroke="#7d98b3" strokeWidth="1" />
  </Face>
)

/** The font menu: an A and a B. */
export const FontStyle = () => (
  <Glyph size={20} viewBox="0 0 20 20">
    <text x="1" y="14" fontFamily="Georgia, serif" fontSize="13" fill="#2f4f75">A</text>
    <text x="9" y="17" fontFamily="Georgia, serif" fontSize="10" fill="#5a7896">B</text>
    <path d="M2 17h8" stroke="#d04b3c" strokeWidth="1.2" />
  </Glyph>
)

/** The handwriting pen at the message box's right. */
export const Pen = () => (
  <Glyph size={18} viewBox="0 0 18 18">
    <path d="M3 15l1.2-3.6L12.5 3l2.5 2.5-8.4 8.3z" fill="#f4f8fc" stroke="#7d98b3" />
    <path d="M3 15l1.2-3.6 2.4 2.4z" fill="#7d98b3" />
  </Glyph>
)

/** The band's background picker: a paintbrush. */
export const Brush = () => (
  <Glyph size={16} viewBox="0 0 16 16">
    <path d="M10 1.5l4.5 4.5-5 3-2.5-2.5z" fill="#ffffff" stroke="#e8f2fb" />
    <path d="M6.5 7l2.5 2.5c-.5 2.5-2.5 4.5-6.5 5 .5-4 2-6 4-7.5z" fill="#ffd84a" stroke="#c99a12" strokeWidth="0.8" />
  </Glyph>
)

/** The ▾ on the blue band, white like its words. */
export const BandCaret = () => (
  <Glyph size={8} viewBox="0 0 8 8">
    <path d="M1 3h6L4 6.5z" fill="#ffffff" />
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
