import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
})
const numberFmt = new Intl.NumberFormat()

export const formatDate = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : '—')
export const formatDateTime = (iso: string | null | undefined) => (iso ? dateTimeFmt.format(new Date(iso)) : '—')
export const formatNumber = (n: number | string | null | undefined) => numberFmt.format(Number(n ?? 0))

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (Math.abs(diff) < 60) return 'just now'
  if (Math.abs(diff) < 3600) return rtf.format(-Math.round(diff / 60), 'minute')
  if (Math.abs(diff) < 86400) return rtf.format(-Math.round(diff / 3600), 'hour')
  if (Math.abs(diff) < 86400 * 30) return rtf.format(-Math.round(diff / 86400), 'day')
  return formatDate(iso)
}

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** JS getDay() (0 = Sunday) → our convention (0 = Monday). */
export const isoWeekday = (d: Date) => (d.getDay() + 6) % 7

/** Readable text colour (white or ink) for a given background hex. */
export function readableOn(hex: string): string {
  const v = parseInt(hex.slice(1), 16)
  const r = (v >> 16) & 255
  const g = (v >> 8) & 255
  const b = v & 255
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#0F172A' : '#FFFFFF'
}
