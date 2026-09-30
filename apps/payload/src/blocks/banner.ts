import {
  BoldFeature,
  InlineCodeFeature,
  InlineToolbarFeature,
  ItalicFeature,
  lexicalEditor,
  ParagraphFeature,
} from '@payloadcms/richtext-lexical'
import type { Block } from 'payload'

export const BANNER_STYLES = ['info', 'warning', 'error', 'success'] as const

export const BannerBlock: Block = {
  slug: 'banner',
  interfaceName: 'BannerBlock',
  labels: { singular: 'Banner', plural: 'Banners' },
  fields: [
    { name: 'style', type: 'select', required: true, defaultValue: 'info', options: [...BANNER_STYLES] },
    {
      name: 'content',
      type: 'richText',
      required: true,
      label: false,
      editor: lexicalEditor({
        features: () => [ParagraphFeature(), BoldFeature(), ItalicFeature(), InlineCodeFeature(), InlineToolbarFeature()],
      }),
    },
  ],
}
