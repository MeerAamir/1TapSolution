import type { AuditLog } from '@/lib/types'

export const DEVICE_LABELS: Record<string, string> = {
  mobile: 'Mobile',
  tablet: 'Tablet',
  desktop: 'Desktop',
  other: 'Other / unknown',
}

export const BROWSER_LABELS: Record<string, string> = {
  chrome: 'Chrome',
  safari: 'Safari',
  firefox: 'Firefox',
  edge: 'Edge',
  samsung: 'Samsung Internet',
  in_app: 'In-app browser',
  other: 'Other',
}

const ENTITY: Record<string, string> = {
  businesses: 'business',
  qr_codes: 'QR code',
  files: 'file',
  categories: 'category',
  admin_users: 'administrator',
}

const VERB: Record<string, string> = {
  insert: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  archive: 'Archived',
  restore: 'Restored',
  activate: 'Activated',
  deactivate: 'Deactivated',
}

export function describeAudit(log: AuditLog): string {
  const entity = ENTITY[log.entity_type] ?? log.entity_type
  const verb = VERB[log.action] ?? log.action
  return `${verb} ${entity}${log.summary ? ` “${log.summary}”` : ''}`
}

export function auditLink(log: AuditLog): string | null {
  if (!log.entity_id || log.action === 'delete') return null
  if (log.entity_type === 'businesses') return `/admin/businesses/${log.entity_id}`
  if (log.entity_type === 'qr_codes') return `/admin/qr/${log.entity_id}`
  return null
}

export const RANGE_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 12 months' },
] as const

export function rangeDates(days: number): { from: Date; to: Date; interval: 'day' | 'month' } {
  const to = new Date()
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  from.setDate(from.getDate() - (days - 1))
  return { from, to: new Date(to.getTime() + 60_000), interval: days > 120 ? 'month' : 'day' }
}
