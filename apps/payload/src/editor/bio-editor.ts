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
import { RecordLinkBlock } from '../blocks/record-link'

export const bioEditor = lexicalEditor({
  features: () => [
    ParagraphFeature(),
    BoldFeature(),
    BlocksFeature({ inlineBlocks: [RecordLinkBlock, ChipLinkBlock, CuriousToggleBlock] }),
    FixedToolbarFeature(),
    InlineToolbarFeature(),
  ],
})
