import { z } from 'zod'

/** Why `schedule_call` was called: only these two triggers exist (spec §6). */
export const ScheduleTrigger = z.enum(['explicit_request', 'hot_tier'])
export type ScheduleTrigger = z.infer<typeof ScheduleTrigger>

/** The descriptor the Messenger window renders as the MSN-style booking dialog. */
export const ScheduleCallRendered = z.object({
  status: z.literal('rendered'),
  calOrigin: z.url(),
  embedScriptUrl: z.url(),
  calLink: z.string().min(1),
  bookingRef: z.string().min(1),
  ownerTimeZone: z.string().min(1),
  visitorTimeZone: z.string().min(1).nullable(),
  prefillName: z.string().min(1).optional(),
})

/** A refusal tells the model why, so it can answer naturally instead of retrying. */
export const ScheduleCallRefused = z.object({
  status: z.literal('refused'),
  reason: z.enum(['already_shown', 'not_hot']),
})

export const ScheduleCallResult = z.discriminatedUnion('status', [ScheduleCallRendered, ScheduleCallRefused])
export type ScheduleCallResult = z.infer<typeof ScheduleCallResult>
export type ScheduleCallRendered = z.infer<typeof ScheduleCallRendered>
