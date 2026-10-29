import { describe, expect, it } from 'vitest'
import { periodRange } from '@/lib/backup'

describe('backup periods', () => {
  const now = new Date(2026, 9, 29, 15, 30)
  it('covers today, this month and the last 30 days from midnight', () => {
    expect(periodRange({ period: 'today' }, now).from).toEqual(new Date(2026, 9, 29))
    expect(periodRange({ period: 'month' }, now).from).toEqual(new Date(2026, 9, 1))
    expect(periodRange({ period: '30d' }, now).from).toEqual(new Date(2026, 8, 30))
    expect(periodRange({ period: 'all' }, now)).toEqual({ from: null, to: null })
  })
  it('includes the whole last day of a custom range', () => {
    const r = periodRange({ period: 'custom', from: '2026-10-01', to: '2026-10-15' }, now)
    expect(r.from).toEqual(new Date(2026, 9, 1))
    expect(r.to?.getDate()).toBe(15)
    expect(r.to?.getHours()).toBe(23)
    expect(periodRange({ period: 'custom', from: 'nope' }, now).from).toBeNull()
  })
})
