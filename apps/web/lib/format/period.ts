export function formatPeriod(start: number, end?: number | null): string {
  if (end == null) return `${start}–`
  if (end === start) return String(start)
  const sameCentury = Math.floor(start / 100) === Math.floor(end / 100)
  return `${start}–${sameCentury ? String(end).slice(-2) : end}`
}
