import type { CollectionBeforeValidateHook, SanitizedCollectionConfig } from 'payload'
import { ValidationError } from 'payload'
import { describe, expect, it } from 'vitest'
import { Scenes } from '@/collections/Scenes'
import { requireSplineFile } from '@/hooks/require-spline-file'
import { isSplineFile } from '@/uploads/spline-file'

describe('isSplineFile', () => {
  it.each(['scene.splinecode', 'desk.spline', 'Desk Model.SPLINECODE', ' scene.spline ', 'my.desk.v2.splinecode'])(
    'accepts %s',
    (name) => {
      expect(isSplineFile(name)).toBe(true)
    },
  )
  it.each([
    'scene.png',
    'scene.splinecode.exe',
    'scene.spline.html',
    'splinecode',
    '.splinecode',
    'scene.',
    'dir/scene.splinecode',
    'dir\\scene.splinecode',
    '',
    null,
    undefined,
  ])('rejects %s', (name) => {
    expect(isSplineFile(name)).toBe(false)
  })
})

type HookArgs = Parameters<CollectionBeforeValidateHook>[0]
const run = (data: HookArgs['data']) =>
  requireSplineFile({ collection: { slug: 'scenes' } as SanitizedCollectionConfig, data } as HookArgs)

describe('requireSplineFile', () => {
  it('passes a Spline upload through', () => {
    const data = { title: 'Desk', filename: 'scene.splinecode' }
    expect(run(data)).toBe(data)
  })
  it('passes updates that do not replace the file', () => {
    const data = { title: 'Renamed' }
    expect(run(data)).toBe(data)
  })
  it('rejects any other file on the file field', () => {
    const thrown = (() => {
      try {
        run({ title: 'Desk', filename: 'photo.png' })
      } catch (error) {
        return error
      }
    })()
    expect(thrown).toBeInstanceOf(ValidationError)
    expect((thrown as ValidationError).data.errors).toEqual([
      { message: 'Upload a Spline export (.spline or .splinecode).', path: 'file' },
    ])
  })
})

describe('Scenes collection', () => {
  const upload = typeof Scenes.upload === 'object' ? Scenes.upload : undefined
  it('never lets Payload sniff or resize the binaries', () => {
    expect(upload?.mimeTypes).toBeUndefined()
    expect(upload?.imageSizes).toBeUndefined()
    expect(Scenes.hooks?.beforeValidate).toContain(requireSplineFile)
  })
  it('serves files as binary', () => {
    const headers = upload?.modifyResponseHeaders?.({ headers: new Headers({ 'Content-Type': 'text/plain' }) })
    expect(headers?.get('Content-Type')).toBe('application/octet-stream')
  })
})
