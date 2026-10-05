import type { Field, GlobalConfig } from 'payload'
import { publicGlobalAccess } from '../access/public-read'
import { urlField } from '../fields/link-url'
import { presenceStatusField } from '../fields/presence'
import { requiredText } from '../fields/required-text'
import { revalidateGlobalHooks } from '../hooks/revalidate-web'

/** A song, shown as "♫ Listening to: …" under the personal message. */
const listeningTo = (defaultValue?: string): Field => ({
  name: 'listeningTo',
  type: 'text',
  defaultValue,
  admin: { description: 'A song, shown as "♫ Listening to: …" under the personal message.' },
})

/** The visitor as Messenger shows them. The owner comes from the Profile global instead. */
const viewer = (name: string, personalMessage: string, song: string): Field[] => [
  requiredText('name', name),
  presenceStatusField(),
  { name: 'personalMessage', type: 'text', defaultValue: personalMessage },
  listeningTo(song),
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
      fields: viewer('Visitor', 'Say hi to Vinicius 👋', 'Daft Punk - Digital Love'),
    },
    {
      name: 'contact',
      type: 'group',
      admin: {
        description:
          'The one contact (the owner). Name, status, status message and avatar come from the Profile global; replies come from the twin agent.',
      },
      fields: [listeningTo()],
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
        requiredText('throttled', "Give me a minute, I'm getting a lot of messages. Try again shortly.", 'Shown when a visitor sends too fast.'),
        requiredText('tooLong', 'That message is a bit long for me. Could you shorten it?', 'Shown when a message exceeds the length cap.'),
        requiredText('ended', "I'll stop here for this conversation. Feel free to book a call instead.", 'Shown when a conversation reaches its limits.'),
        requiredText('offline', "I can't reply right now. Try again in a little while.", 'Shown when the twin is unreachable.'),
        requiredText('privacy', 'This chat is with an AI version of me. Messages are stored for 90 days, then deleted.', 'Footer of the conversation window.'),
        requiredText('deleteData', 'Delete my data', 'Footer link that erases this visitor’s conversations.'),
        requiredText('bookingTitle', 'Schedule a call', 'Title bar of the booking dialog.'),
        requiredText('yourTime', 'Your time', 'Label before the visitor’s time zone.'),
        requiredText('myTime', 'My time', 'Label before the owner’s time zone.'),
        requiredText('bookingNotice', 'Call booked for {time}.', 'System line after a booking; {time} is the visitor’s local time.'),
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
