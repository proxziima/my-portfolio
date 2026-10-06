'use client'
import { useEffect, useId, useRef, useState } from 'react'
import type { ScheduleCallRendered } from '@repo/twin/contract'
import type { MessengerLabels } from '@/lib/cms/types'
import bevel from '../../bevel.module.css'
import { formatZoneTime, mountInline } from './cal-embed'
import styles from './messenger.module.css'

/** The Cal.com booker inside an MSN-era dialog: title bar, bevelled frame, both time zones. */
export function BookingDialog({ booking, labels }: { booking: ScheduleCallRendered; labels: MessengerLabels }) {
  const ns = `twin${useId().replace(/[^a-z0-9]/gi, '')}`
  const target = useRef<HTMLDivElement>(null)
  const [now] = useState(() => new Date())
  const visitorZone = booking.visitorTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  // The history rebuilds its lines on every streamed delta, so the effect keys on the values, not the object.
  const { calOrigin, embedScriptUrl, calLink, bookingRef, prefillName } = booking

  useEffect(() => {
    if (target.current) mountInline(target.current, ns, { calOrigin, embedScriptUrl, calLink, bookingRef, prefillName })
  }, [ns, calOrigin, embedScriptUrl, calLink, bookingRef, prefillName])

  return (
    <section className={`${styles.dialog} ${bevel.raised}`} aria-label={labels.bookingTitle}>
      <header className={styles.dialogTitle}>{labels.bookingTitle}</header>
      <p className={styles.dialogZones}>
        {labels.yourTime}: {formatZoneTime(now, visitorZone)} ({visitorZone}) · {labels.myTime}: {formatZoneTime(now, booking.ownerTimeZone)} ({booking.ownerTimeZone})
      </p>
      <div ref={target} className={`${styles.dialogBody} ${bevel.sunken}`} />
    </section>
  )
}
