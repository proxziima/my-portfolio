import type { Block } from 'payload'

export const CODE_LANGUAGES = ['typescript', 'javascript', 'tsx', 'bash', 'json', 'css', 'go', 'python', 'sql'] as const

export const CodeBlock: Block = {
  slug: 'code',
  interfaceName: 'CodeBlock',
  labels: { singular: 'Code', plural: 'Code blocks' },
  fields: [
    { name: 'language', type: 'select', required: true, defaultValue: 'typescript', options: [...CODE_LANGUAGES] },
    { name: 'code', type: 'code', required: true, label: false },
  ],
}
