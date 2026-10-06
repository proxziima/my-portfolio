import type { MessengerStatus } from '@/lib/cms/types'

/** As Messenger writes it after a name: "Vinicius Queiroz (Available)". */
export const STATUS_LABEL: Record<MessengerStatus, string> = {
  available: 'Available',
  busy: 'Busy',
  away: 'Away',
  offline: 'Offline',
}
