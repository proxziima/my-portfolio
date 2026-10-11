/** Highest CRF in [lo, hi] for which `passes` holds, assuming quality falls monotonically with CRF. Null if even `lo` fails. */
export async function highestPassingCrf(lo: number, hi: number, passes: (crf: number) => Promise<boolean>): Promise<number | null> {
  if (!(await passes(lo))) return null
  let good = lo
  let bad = hi + 1
  while (bad - good > 1) {
    const mid = Math.floor((good + bad) / 2)
    if (await passes(mid)) good = mid
    else bad = mid
  }
  return good
}

/**
 * First CRF from `start` down to `floor` for which `passes` holds, giving up once `tooBig(crf)` says an
 * encode already costs as much as what would be served instead. Linear rather than bisected: at the
 * extreme low end quality is not monotonic (SVT-AV1 at CRF 1 lifts every frame's luma by about 0.6).
 */
export async function firstPassingBelow(start: number, floor: number, passes: (crf: number) => Promise<boolean>, tooBig: (crf: number) => boolean): Promise<number | null> {
  for (let crf = start; crf >= floor; crf--) {
    if (await passes(crf)) return crf
    if (tooBig(crf)) return null
  }
  return null
}
