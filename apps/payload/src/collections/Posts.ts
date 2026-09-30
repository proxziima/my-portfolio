import type { CollectionConfig } from 'payload'
import { authenticated } from '../access/authenticated'
import { publishedOrAuthenticated } from '../access/published-or-authenticated'
import { postEditor } from '../editor/post-editor'
import { slugField } from '../fields/slug'
import { populateAuthors } from '../hooks/populate-authors'
import { populatePublishedAt } from '../hooks/populate-published-at'
import { revalidateCollectionHooks } from '../hooks/revalidate-web'
import { buildPreviewUrl, postPreviewPath } from '../plugins/preview-url'

// Both run on the server, so the secret never reaches the admin bundle. `null` (no slug or env) hides
// the Preview button and the Live Preview tab.
const postPreviewUrl = (slug: unknown) =>
  buildPreviewUrl({ webUrl: process.env.WEB_URL, secret: process.env.PREVIEW_SECRET, path: postPreviewPath(slug) })

// The SEO plugin (tabbedUI) appends an "SEO" tab with the `meta` group to the tabs below.
export const Posts: CollectionConfig<'posts'> = {
  slug: 'posts',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', '_status', 'publishedAt'],
    group: 'Blog',
    preview: (doc) => postPreviewUrl(doc.slug),
    // The Live Preview iframe enters through the same draft-preview route, then `RefreshRouteOnSave` on
    // the web page re-renders it after every autosave. Breakpoints live in payload.config.ts.
    livePreview: { url: ({ data }) => postPreviewUrl(data.slug) },
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
    // A 100ms autosave keeps Live Preview close to real time; each save triggers one draft re-render on the web.
    drafts: { autosave: { interval: 100 }, schedulePublish: true },
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
    slugField(),
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
