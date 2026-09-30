/** Spline exports: `.spline` (editor file) and `.splinecode` (runtime export). Both are msgpack binaries. */
export const SPLINE_EXTENSIONS: readonly string[] = ['spline', 'splinecode']

/**
 * True when the filename (not a path) has a Spline extension and a name before it. Spline files have no
 * standard MIME type (browsers send `application/octet-stream` or nothing), so the extension is all there is.
 */
export const isSplineFile = (filename: string | null | undefined): boolean => {
  if (typeof filename !== 'string') return false
  const name = filename.trim()
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || /[/\\]/.test(name)) return false
  return SPLINE_EXTENSIONS.includes(name.slice(dot + 1).toLowerCase())
}
