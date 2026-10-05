import { mcpPlugin } from '@payloadcms/plugin-mcp'
import { twinTools } from './twin-tools'

const crud = { find: true, create: true, update: true, delete: true }
const readWrite = { find: true, update: true }

export const portfolioMcp = mcpPlugin({
  mcp: { tools: twinTools },
  collections: {
    disciplines: {
      enabled: crud,
      description:
        'Roles the portfolio can switch between (e.g. Software engineer). Each has a Lexical rich-text bio whose paragraphs must stay parallel across disciplines, a picker level label, a figure caption and curious-mode formula notes. Link companies and projects in bios with the recordLink inline block; chipLink is for free-text links only.',
    },
    companies: {
      enabled: crud,
      description:
        'Companies referenced by experiences, projects and bio links: name, favicon chip, url, optional logo, disclosure tier. The icon shown is the logo, else the favicon fetched from the url, else the chip. `favicon` is filled automatically from the url; do not set it. `chip` is required, up to 3 characters.',
    },
    experiences: {
      enabled: crud,
      description:
        'Professional background: one row per company (a relationship to companies) + title, with start/end years and the disciplines it belongs to.',
    },
    projects: {
      enabled: crud,
      description:
        'Portfolio projects: name, favicon chip, url, optional logo, one-line summary, optional company, disciplines. The icon shown is the logo, else the favicon fetched from the url, else the chip. `favicon` is filled automatically from the url; do not set it. `chip` is required, up to 3 characters.',
    },
    content: { enabled: crud, description: 'Content & community: articles, talks, podcasts, open-source and community work.' },
    knowledge: { enabled: crud, description: 'Knowledge base: facts and writing samples, each with a disclosure tier.' },
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
