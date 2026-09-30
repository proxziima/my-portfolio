import type { GlobalConfig } from 'payload'
import { publicGlobalAccess } from '../access/public-read'
import { revalidateGlobalHooks } from '../hooks/revalidate-web'

const text = (name: string, defaultValue: string, description?: string) => ({
  name,
  type: 'text' as const,
  required: true,
  defaultValue,
  admin: description ? { description } : undefined,
})

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Site settings',
  access: publicGlobalAccess,
  hooks: revalidateGlobalHooks,
  fields: [
    {
      name: 'seo',
      type: 'group',
      fields: [
        text('title', 'Vinicius Queiroz — engineer and builder'),
        text('description', 'One letter, three disciplines.'),
        { name: 'ogImage', type: 'upload', relationTo: 'media' },
      ],
    },
    { name: 'defaultDiscipline', type: 'relationship', relationTo: 'disciplines' },
    {
      name: 'figure',
      type: 'group',
      fields: [
        {
          name: 'splineSceneUrl',
          type: 'text',
          admin: { description: 'Spline → Export → Code → copy the .splinecode URL. Empty = /spline/scene.splinecode.' },
        },
      ],
    },
    {
      name: 'sectionLabels',
      type: 'group',
      fields: [text('work', 'Work'), text('projects', 'Projects'), text('content', 'Content & community')],
    },
    text('pickerHint', 'scroll to change class'),
    {
      name: 'pageNotes',
      type: 'group',
      admin: { description: 'Handwritten notes shown in curious mode.' },
      fields: [
        text('headline', 'Inter, everywhere. One family keeps the page quiet.'),
        text('columnWidth', '{w}px. Narrow enough to read; wide enough to breathe.', '{w} is replaced by the measured column width.'),
        text('wallSwitch', 'A real rocker, 17 frames. Flick it ten times and see what happens.'),
        text('sectionGap', '64px between sections. Separate, not disconnected.'),
        text('chips', '16px chips: enough character without becoming a logo wall.'),
        text('role', 'Hover the role. It rolls, the letter rewrites itself — only the words that change.'),
      ],
    },
  ],
}
