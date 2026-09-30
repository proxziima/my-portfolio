import {
  BlocksFeature,
  BoldFeature,
  FixedToolbarFeature,
  InlineToolbarFeature,
  lexicalEditor,
  ParagraphFeature,
} from '@payloadcms/richtext-lexical'
import { ChipLinkBlock } from '../blocks/chip-link'
import { CuriousToggleBlock } from '../blocks/curious-toggle'

export const bioEditor = lexicalEditor({
  features: () => [
    ParagraphFeature(),
    BoldFeature(),
    BlocksFeature({ inlineBlocks: [ChipLinkBlock, CuriousToggleBlock] }),
    FixedToolbarFeature(),
    InlineToolbarFeature(),
  ],
})
