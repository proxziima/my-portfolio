import { type CollectionBeforeValidateHook, ValidationError } from 'payload'
import { isSplineFile, SPLINE_EXTENSIONS } from '../uploads/spline-file'

const MESSAGE = `Upload a Spline export (${SPLINE_EXTENSIONS.map((e) => `.${e}`).join(' or ')}).`

/**
 * Rejects anything that isn't a Spline file. It runs after Payload has read the upload (so `data.filename`
 * is set for file and paste-from-URL uploads alike) and before the file is written to disk. Updates that
 * don't replace the file carry no new filename and pass through.
 */
export const requireSplineFile: CollectionBeforeValidateHook = ({ collection, data }) => {
  const filename: unknown = data?.filename
  if (typeof filename === 'string' && !isSplineFile(filename)) {
    throw new ValidationError({ collection: collection.slug, errors: [{ message: MESSAGE, path: 'file' }] })
  }
  return data
}
