import type { CollectionConfig } from 'payload'
import { authenticated } from '../access/authenticated'
import { publishedOrAuthenticated } from '../access/published-or-authenticated'
import { postEditor } from '../editor/post-editor'
import { titleSlugField } from '../fields/slug'
import { populateAuthors } from '../hooks/populate-authors'
import { populatePublishedAt } from '../hooks/populate-published-at'
import { revalidateCollectionHooks } from '../hooks/revalidate-web'
import { buildPreviewUrl, postLivePreviewUrl, postPreviewPath } from '../plugins/preview-url'

const AUTOSAVE_INTERVAL_MS = 2000

// Runs on the server, so the secret never reaches the admin bundle. `null` (no slug or env) hides the button.
const postPreviewUrl = (slug: unknown) =>
  buildPreviewUrl({ webUrl: process.env.WEB_URL, secret: process.env.PREVIEW_SECRET, path: postPreviewPath(slug) })

// The SEO plugin (tabbedUI) appends an "SEO" tab with the `meta` group to the tabs below.
export const Posts: CollectionConfig<'posts'> = {
  slug: 'posts',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', '_status', 'publishedAt'],
    group: 'Blog',
    // The button enters draft mode through /api/preview and lands on the post's public URL, /blog/<slug>.
    preview: (doc) => postPreviewUrl(doc.slug),
    // The Live Preview iframe loads /blog/preview/<id> directly; the web page checks the admin session itself.
    // Keyed by id: `data` is the unsaved form, whose slug changes with every title keystroke before autosave
    // stores it. `RefreshRouteOnSave` on the page re-renders it after every save. Breakpoints: payload.config.ts.
    livePreview: { url: ({ data }) => postLivePreviewUrl({ webUrl: process.env.WEB_URL, id: data?.id }) },
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
