import type { CollectionConfig } from 'payload'
import { authenticated } from '../access/authenticated'
import { publishedOrAuthenticated } from '../access/published-or-authenticated'
import { postEditor } from '../editor/post-editor'
import { titleSlugField } from '../fields/slug'
import { populateAuthors } from '../hooks/populate-authors'
import { populatePublishedAt } from '../hooks/populate-published-at'
import { revalidateCollectionHooks } from '../hooks/revalidate-web'
import { buildPreviewUrl, postLivePreviewPath, postPreviewPath } from '../plugins/preview-url'

const AUTOSAVE_INTERVAL_MS = 2000

// Both run on the server, so the secret never reaches the admin bundle. `null` (no path or env) hides
// the Preview button and the Live Preview tab.
const webPreviewUrl = (path: string | null) =>
  buildPreviewUrl({ webUrl: process.env.WEB_URL, secret: process.env.PREVIEW_SECRET, path })

// The SEO plugin (tabbedUI) appends an "SEO" tab with the `meta` group to the tabs below.
export const Posts: CollectionConfig<'posts'> = {
  slug: 'posts',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', '_status', 'publishedAt'],
    group: 'Blog',
    // The button opens the post's public URL, /blog/<slug>.
    preview: (doc) => webPreviewUrl(postPreviewPath(doc.slug)),
    // The Live Preview iframe enters through the same draft-preview route, but keyed by id: `data` is the
    // unsaved form, and its slug changes with every title keystroke before autosave stores it. Then
    // `RefreshRouteOnSave` on the web page re-renders it after every save. Breakpoints live in payload.config.ts.
    livePreview: { url: ({ data }) => webPreviewUrl(postLivePreviewPath(data?.id)) },
  },
  access: {
    read: publishedOrAuthenticated,
    readVersions: authenticated,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  defaultPopulate: { title: true, slug: true, excerpt: true, heroImage: true, categories: true, publishedAt: true },
  hooks: {
    ...revalidateCollectionHooks,
    beforeChange: [populatePublishedAt],
    afterRead: [populateAuthors],
  },
  versions: {
    // Autosave is debounced, so it only fires after a ~2s pause in typing, not on every keystroke. Live Preview
    // refreshes after each autosave, so it updates on those pauses; "Save draft" saves (and refreshes) right away.
    drafts: { autosave: { interval: AUTOSAVE_INTERVAL_MS, showSaveDraftButton: true }, schedulePublish: true },
    maxPerDoc: 50,
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            { name: 'title', type: 'text', required: true },
            { name: 'excerpt', type: 'textarea', admin: { description: 'One or two sentences for listings and search.' } },
            { name: 'heroImage', type: 'upload', relationTo: 'media' },
            { name: 'content', type: 'richText', editor: postEditor, required: true },
          ],
        },
      ],
    },
    titleSlugField(),
    {
      name: 'publishedAt',
      type: 'date',
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' }, description: 'Set on first publish.' },
    },
    {
      name: 'authors',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      defaultValue: ({ user }) => (user ? [user.id] : []),
      admin: { position: 'sidebar' },
    },
    { name: 'categories', type: 'relationship', relationTo: 'categories', hasMany: true, admin: { position: 'sidebar' } },
    {
      name: 'relatedPosts',
      type: 'relationship',
      relationTo: 'posts',
      hasMany: true,
      filterOptions: ({ id }) => (id ? { id: { not_in: [id] } } : true),
      admin: { position: 'sidebar' },
    },
    {
      // Public author names, filled by `populateAuthors`. Virtual: never stored, never writable.
      name: 'populatedAuthors',
      type: 'array',
      virtual: true,
      access: { create: () => false, update: () => false },
      admin: { disabled: true, readOnly: true },
      fields: [
        { name: 'id', type: 'text' },
        { name: 'name', type: 'text' },
      ],
    },
  ],
}
