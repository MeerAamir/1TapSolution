/** "Valid until" dates of QR codes: after that moment scans show "not active". */

export type ExpiryStep = { label: string; days?: number; months?: number }

export const EXPIRY_STEPS: ExpiryStep[] = [
  { label: '7 days', days: 7 },
  { label: '1 month', months: 1 },
  { label: '3 months', months: 3 },
  { label: '6 months', months: 6 },
  { label: '1 year', months: 12 },
]

const DAY = 86_400_000

/**
 * New end date after adding a period. Renewing a code that is still valid adds
 * to its current end date (nobody loses paid days); an expired or unlimited
 * code starts from today. The end is the last moment of that day.
 */
export function extendExpiry(current: string | null | undefined, step: ExpiryStep, now = new Date()): string {
  const cur = current ? new Date(current) : null
  const base = cur && cur.getTime() > now.getTime() ? new Date(cur) : new Date(now)
  if (step.days) base.setDate(base.getDate() + step.days)
  if (step.months) {
    const day = base.getDate()
    base.setDate(1)
    base.setMonth(base.getMonth() + step.months)
    // 31 Jan + 1 month → 28/29 Feb, not 3 March.
    base.setDate(Math.min(day, new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()))
  }
  base.setHours(23, 59, 59, 0)
  return base.toISOString()
}

/** End of the chosen calendar day (yyyy-mm-dd from a date input), local time. */
export function endOfDay(dateInput: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59)
  if (d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null
  return d.toISOString()
}

/** yyyy-mm-dd for a date input. */
export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export type ExpiryInfo =
  | { kind: 'none' }
  | { kind: 'expired'; date: string; daysAgo: number }
  | { kind: 'active'; date: string; daysLeft: number; soon: boolean }

export function expiryInfo(iso: string | null | undefined, now = new Date()): ExpiryInfo {
  if (!iso) return { kind: 'none' }
  const end = new Date(iso)
  const date = end.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  const diff = end.getTime() - now.getTime()
  if (diff <= 0) return { kind: 'expired', date, daysAgo: Math.floor(-diff / DAY) }
  const daysLeft = Math.ceil(diff / DAY)
  return { kind: 'active', date, daysLeft, soon: daysLeft <= 7 }
}

export function expiryLabel(info: ExpiryInfo): string {
  switch (info.kind) {
    case 'none':
      return 'No end date'
    case 'expired':
      return `Expired ${info.date}`
    case 'active':
      return info.daysLeft <= 1 ? 'Expires today' : `${info.daysLeft} days left`
  }
}
