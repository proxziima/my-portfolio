import type { GlobalConfig } from 'payload'
import { publicGlobalAccess } from '../access/public-read'
import { urlField } from '../fields/link-url'
import { revalidateGlobalHooks } from '../hooks/revalidate-web'

const requiredText = (name: string, defaultValue: string, description?: string) => ({
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
        requiredText('title', 'Vinicius Queiroz — engineer and builder'),
        requiredText('description', 'One letter, three disciplines.'),
        { name: 'ogImage', type: 'upload', relationTo: 'media' },
      ],
    },
    { name: 'defaultDiscipline', type: 'relationship', relationTo: 'disciplines' },
    {
      name: 'figure',
      type: 'group',
      fields: [
        {
          name: 'scene',
          type: 'upload',
          relationTo: 'scenes',
          admin: { description: 'Unused since the three.js desk (October 2026); kept until a migration removes it.' },
        },
        {
          ...urlField('splineSceneUrl'),
          admin: { description: 'Unused since the three.js desk (October 2026); kept until a migration removes it.' },
        },
      ],
    },
    {
      name: 'sectionLabels',
      type: 'group',
      fields: [requiredText('work', 'Work'), requiredText('projects', 'Projects'), requiredText('content', 'Content & community')],
    },
    requiredText('pickerHint', 'scroll to change class'),
    {
      name: 'pageNotes',
      type: 'group',
      admin: { description: 'Handwritten notes shown in curious mode.' },
      fields: [
        requiredText('headline', 'Inter, everywhere. One family keeps the page quiet.'),
        requiredText('columnWidth', '{w}px. Narrow enough to read; wide enough to breathe.', '{w} is replaced by the measured column width.'),
        requiredText('wallSwitch', 'A real rocker, 17 frames. Flick it ten times and see what happens.'),
        requiredText('sectionGap', '64px between sections. Separate, not disconnected.'),
        requiredText('chips', '16px chips: enough character without becoming a logo wall.'),
        requiredText('role', 'Hover the role. It rolls, the letter rewrites itself — only the words that change.'),
      ],
    },
  ],
}
