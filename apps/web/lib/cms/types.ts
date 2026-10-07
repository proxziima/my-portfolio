import type { Post } from '@repo/cms-types'

export type Side = 'left' | 'right'

export interface CuriousNote { side: Side; text: string; formula?: string }

export interface Discipline {
  slug: string
  title: string
  level: string
  caption: string
  /** Paragraphs in the morph's HTML dialect (see lib/cms/bio-html.ts). */
  bio: string[]
  notes: CuriousNote[]
}

/** One row of Work / Projects / Content. */
export interface Entry {
  id: string
  chip: string
  label: string
  href?: string
  /** Logo or favicon URL; the chip shows when absent. */
  icon?: string
  meta: string
  aside?: string
  /** Discipline slugs; empty = shown for every discipline. */
  disciplines: string[]
}

export interface LinkItem { label: string; chip: string; href: string }
export interface NavItem { label: string; href: string; newTab: boolean }

export interface PageNotes {
  headline: string; columnWidth: string; wallSwitch: string; sectionGap: string; chips: string; role: string
}

export interface Settings {
  seo: { title: string; description: string; ogImage?: string }
  sectionLabels: { work: string; projects: string; content: string }
  pickerHint: string
  pageNotes: PageNotes
}

export interface Portfolio {
  profile: { name: string; headlineTail: string; email: string }
  disciplines: Discipline[]
  defaultSlug: string
  work: Entry[]
  projects: Entry[]
  content: Entry[]
  contactLinks: LinkItem[]
  nav: NavItem[]
  settings: Settings
}

/** A blog post as the page renders it. Author names only: emails never leave the CMS mapper. */
export interface PostView {
  title: string
  slug: string
  excerpt?: string
  /** Lexical editor state, rendered by features/blog/PostBody. */
  content: Post['content']
  publishedAt?: string
  authors: string[]
  heroImage?: { url: string; alt: string }
  status: 'draft' | 'published'
}

export type MessengerStatus = 'available' | 'busy' | 'away' | 'offline'

/** Someone the Messenger shows: the visitor or the contact. Absolute avatar URL. */
export interface MessengerPerson {
  name: string
  status: MessengerStatus
  personalMessage?: string
  /** A song: "♫ Listening to: …". */
  listeningTo?: string
  avatar?: string
}

export interface WhatsNewItem {
  id: string
  text: string
  link?: { label: string; href: string }
  image?: string
}

export interface MessengerLabels {
  search: string
  favorites: string
  friends: string
  whatsNew: string
  /** `{name}` is replaced by the contact's name. */
  typing: string
  /** `{name}` is replaced by the contact's name. */
  conversation: string
  send: string
  listeningTo: string
  /** Shown when the visitor sends too fast. */
  throttled: string
  /** Shown when a message exceeds the length cap. */
  tooLong: string
  /** Shown when the conversation has reached its limits. */
  ended: string
  /** Shown when the twin is unreachable. */
  offline: string
  /** Footer of the Conversation window. */
  privacy: string
  /** Footer link that erases this visitor's conversations. */
  deleteData: string
  /** Title of the booking dialog. */
  bookingTitle: string
  /** Label of the visitor's time zone in the booking dialog. */
  yourTime: string
  /** Label of the owner's time zone in the booking dialog. */
  myTime: string
  /** System line after a booking; `{time}` is replaced by the booked time. */
  bookingNotice: string
  /** The words on the Conversation window's blue band. */
  menu: string[]
}

/** The featured story at the foot of the main window. */
export interface Spotlight {
  title: string
  text?: string
  href?: string
  source?: string
  image?: string
}

export interface Messenger {
  title: string
  shortcut: string
  viewer: MessengerPerson
  contact: MessengerPerson
  labels: MessengerLabels
  whatsNew: WhatsNewItem[]
  spotlight?: Spotlight
}
