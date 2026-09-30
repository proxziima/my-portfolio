import { mcpPlugin } from '@payloadcms/plugin-mcp'

const crud = { find: true, create: true, update: true, delete: true }
const readWrite = { find: true, update: true }

export const portfolioMcp = mcpPlugin({
  collections: {
    disciplines: {
      enabled: crud,
      description:
        'Roles the portfolio can switch between (e.g. Software engineer). Each has a Lexical rich-text bio whose paragraphs must stay parallel across disciplines, a picker level label, a figure caption and curious-mode formula notes.',
    },
    experiences: {
      enabled: crud,
      description: 'Professional background: one row per company + title, with start/end years and the disciplines it belongs to.',
    },
    projects: { enabled: crud, description: 'Portfolio projects: name, favicon chip, url, one-line summary, disciplines.' },
    content: { enabled: crud, description: 'Content & community: articles, talks, podcasts, open-source and community work.' },
    media: { enabled: { find: true }, description: 'Uploaded images (avatar, Open Graph image).' },
  },
  globals: {
    profile: { enabled: readWrite, description: 'Owner identity: name, headline tail, email, location, avatar.' },
    contact: { enabled: readWrite, description: 'Contact link row under the figure (email, LinkedIn, GitHub…).' },
    navigation: { enabled: readWrite, description: 'Footer navigation items.' },
    'site-settings': {
      enabled: readWrite,
      description: 'SEO, default discipline, Spline scene URL, section labels, picker hint and curious-mode page notes.',
    },
  },
})
