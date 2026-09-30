import {
  BlockquoteFeature,
  BlocksFeature,
  BoldFeature,
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  InlineCodeFeature,
  InlineToolbarFeature,
  ItalicFeature,
  lexicalEditor,
  LinkFeature,
  OrderedListFeature,
  ParagraphFeature,
  StrikethroughFeature,
  UnderlineFeature,
  UnorderedListFeature,
  UploadFeature,
} from '@payloadcms/richtext-lexical'
import type { FieldAffectingData, TextFieldSingleValidation } from 'payload'
import { BannerBlock } from '../blocks/banner'
import { CodeBlock } from '../blocks/code'
import { MediaBlock } from '../blocks/media-block'
import { validateLinkUrl } from '../fields/link-url'

// Lexical's default only rejects spaces, so `javascript:` URLs would pass. Internal links carry no URL.
const validateExternalUrl: TextFieldSingleValidation = (value, { siblingData }) => {
  if ((siblingData as { linkType?: string }).linkType === 'internal') return true
  return value ? validateLinkUrl(value) : 'Enter a URL.'
}

const withSafeUrl = (field: FieldAffectingData): FieldAffectingData =>
  field.type === 'text' && field.name === 'url' && !field.hasMany ? { ...field, validate: validateExternalUrl } : field

export const postEditor = lexicalEditor({
  features: () => [
    ParagraphFeature(),
    HeadingFeature({ enabledHeadingSizes: ['h2', 'h3', 'h4'] }),
    BoldFeature(),
    ItalicFeature(),
    UnderlineFeature(),
    StrikethroughFeature(),
    InlineCodeFeature(),
    LinkFeature({
      enabledCollections: ['posts'],
      fields: ({ defaultFields }) => defaultFields.map(withSafeUrl),
    }),
    OrderedListFeature(),
    UnorderedListFeature(),
    BlockquoteFeature(),
    HorizontalRuleFeature(),
    UploadFeature({ enabledCollections: ['media'] }),
    BlocksFeature({ blocks: [CodeBlock, BannerBlock, MediaBlock] }),
    FixedToolbarFeature(),
    InlineToolbarFeature(),
  ],
})
