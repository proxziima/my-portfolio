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
const person = (name: string, personalMessage?: string): Field[] => [
  requiredText('name', name),
  { name: 'status', type: 'select', required: true, defaultValue: 'available', options: STATUSES },
  { name: 'personalMessage', type: 'text', defaultValue: personalMessage },
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
      fields: person('Visitor', 'Say hi to Vinicius 👋'),
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
      fields: [
        requiredText('search', 'Search contacts or the web...'),
        requiredText('favorites', 'Favorites'),
        requiredText('friends', 'Friends'),
        requiredText('whatsNew', "What's new"),
        requiredText('typing', '{name} is typing a message...', "{name} is replaced by the contact's name."),
        requiredText('send', 'Send'),
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
  ],
}
