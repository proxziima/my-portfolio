import { describe, expect, it } from 'vitest'
import { posthogConfig } from '../src/config'

describe('posthogConfig', () => {
  it('is null without a token, or with a blank one', () => {
    expect(posthogConfig({})).toBeNull()
    expect(posthogConfig({ POSTHOG_PROJECT_TOKEN: '   ' })).toBeNull()
  })

  it('defaults to the US region and derives every host from it', () => {
    expect(posthogConfig({ POSTHOG_PROJECT_TOKEN: 'phc_x' })).toEqual({
      token: 'phc_x',
      region: 'us',
      ingestHost: 'https://us.i.posthog.com',
      assetsHost: 'https://us-assets.i.posthog.com',
      uiHost: 'https://us.posthog.com',
    })
  })

  it('derives the EU hosts', () => {
    expect(posthogConfig({ POSTHOG_PROJECT_TOKEN: 'phc_x', POSTHOG_REGION: 'eu' })).toMatchObject({
      region: 'eu',
      ingestHost: 'https://eu.i.posthog.com',
      assetsHost: 'https://eu-assets.i.posthog.com',
      uiHost: 'https://eu.posthog.com',
    })
  })

  it('treats a blank region as the default and rejects an unknown one', () => {
    expect(posthogConfig({ POSTHOG_PROJECT_TOKEN: 'phc_x', POSTHOG_REGION: '' })?.region).toBe('us')
    expect(() => posthogConfig({ POSTHOG_PROJECT_TOKEN: 'phc_x', POSTHOG_REGION: 'mars' })).toThrow(/POSTHOG_REGION/)
  })
})
