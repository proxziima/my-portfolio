import type { Field, GlobalConfig } from 'payload'
import { publicGlobalAccess } from '../access/public-read'
import { urlField } from '../fields/link-url'
import { requiredText } from '../fields/required-text'
import { revalidateGlobalHooks } from '../hooks/revalidate-web'

const STATUSES = [
  { label: 'Available', value: 'available' },
  { label: 'Busy', value: 'busy' },
  { label: 'Away', value: 'away' },
  { label: 'Offline', value: 'offline' },
]

/** A person as Messenger shows them: the visitor (viewer) or the owner (contact). */
const person = (name: string, personalMessage?: string, listeningTo?: string): Field[] => [
  requiredText('name', name),
  { name: 'status', type: 'select', required: true, defaultValue: 'available', options: STATUSES },
  { name: 'personalMessage', type: 'text', defaultValue: personalMessage },
  {
    name: 'listeningTo',
    type: 'text',
    defaultValue: listeningTo,
    admin: { description: 'A song, shown as "♫ Listening to: …" under the personal message.' },
  },
  { name: 'avatar', type: 'upload', relationTo: 'media' },
]

/** The Messenger app on the /os desktop: its window, the visitor, the one contact and What's new. */
export const Messenger: GlobalConfig = {
  slug: 'messenger',
  access: publicGlobalAccess,
  hooks: revalidateGlobalHooks,
  fields: [
    requiredText('title', 'Windows Live Messenger', 'The window title and taskbar tab.'),
    requiredText('shortcut', 'Messenger', 'The desktop shortcut label.'),
    {
      name: 'viewer',
      type: 'group',
      admin: { description: 'The visitor, signed in at the top of the main window.' },
      fields: person('Visitor', 'Say hi to Vinicius 👋', 'Daft Punk - Digital Love'),
    },
    {
      name: 'contact',
      type: 'group',
      admin: { description: 'The one contact (the owner), listed under Favorites and Friends.' },
      fields: [
        ...person('Vinicius Queiroz'),
        {
          name: 'replies',
          type: 'array',
          required: true,
          minRows: 1,
          defaultValue: [{ text: 'hey! 👋' }],
          admin: { description: "Scripted replies: a visitor's Nth message gets the Nth reply; the last one repeats." },
          fields: [{ name: 'text', type: 'textarea', required: true }],
        },
      ],
    },
    {
      name: 'labels',
      type: 'group',
      admin: { description: 'The fixed words of the Messenger windows.' },
      fields: [
        requiredText('search', 'Search contacts or the web...'),
        requiredText('favorites', 'Favorites'),
        requiredText('friends', 'Friends'),
        requiredText('whatsNew', "What's new"),
        requiredText('typing', '{name} is typing a message...', "{name} is replaced by the contact's name."),
        requiredText('conversation', '{name} - Conversation', "{name} is replaced by the contact's name."),
        requiredText('send', 'Send'),
        requiredText('listeningTo', 'Listening to:'),
        {
          name: 'menu',
          type: 'array',
          admin: { description: "The words on the Conversation window's blue band." },
          defaultValue: ['Photos', 'Files', 'Video', 'Call', 'Games', 'Activities'].map((label) => ({ label })),
          fields: [{ name: 'label', type: 'text', required: true }],
        },
      ],
    },
    {
      name: 'whatsNew',
      type: 'array',
      admin: { description: "The What's new panel; several items get a pager." },
      fields: [
        { name: 'text', type: 'text', required: true },
        { name: 'linkLabel', type: 'text', admin: { description: 'Defaults to the URL.' } },
        urlField('url'),
        { name: 'image', type: 'upload', relationTo: 'media' },
      ],
    },
    {
      name: 'spotlight',
      type: 'group',
      admin: { description: 'The featured story at the foot of the main window (MSN Video in the original). Hidden without a title.' },
      fields: [
        { name: 'title', type: 'text' },
        { name: 'text', type: 'textarea' },
        urlField('url'),
        { name: 'source', type: 'text', admin: { description: 'The small link under the story, e.g. "My Showcase".' } },
        { name: 'image', type: 'upload', relationTo: 'media' },
      ],
    },
  ],
}
