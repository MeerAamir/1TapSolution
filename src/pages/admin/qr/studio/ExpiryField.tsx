import { CalendarClock, Lock, Unlock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { endOfDay, EXPIRY_STEPS, expiryInfo, extendExpiry, toDateInput } from '@/lib/qr/expiry'
import { cn } from '@/lib/utils'

/**
 * "Valid until": when the time is up, scans show "This QR code is not active
 * right now" until the code is renewed (for example after the customer pays).
 */
export function ExpiryField({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const info = expiryInfo(value)
  return (
    <div className="grid gap-3">
      <div
        className={cn(
          'flex items-start gap-3 rounded-xl px-3 py-2.5 text-sm ring-1',
          info.kind === 'expired' ? 'bg-danger/5 text-danger ring-danger/30' : info.kind === 'active' && info.soon ? 'bg-amber-50 text-amber-800 ring-amber-300' : 'bg-surface ring-line',
        )}
      >
        {info.kind === 'expired' ? <Lock className="mt-0.5 size-4 shrink-0" /> : <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted" />}
        <p>
          {info.kind === 'none' && 'Always active. Set an end date to make the code stop working after a period, for example a paid plan.'}
          {info.kind === 'active' && (
            <>
              Active until <strong>{info.date}</strong> ({info.daysLeft <= 1 ? 'ends today' : `${info.daysLeft} days left`}). After that, scans show “not active right now”.
            </>
          )}
          {info.kind === 'expired' && (
            <>
              <strong>Blocked.</strong> Ended on {info.date}. Scans show “not active right now”. Add time below to unlock it.
            </>
          )}
        </p>
      </div>
      <div className="grid gap-1.5">
        <p className="text-sm font-medium">{info.kind === 'none' ? 'Active for' : info.kind === 'expired' ? 'Unlock for' : 'Add time'}</p>
        <div className="flex flex-wrap gap-2">
          {EXPIRY_STEPS.map((s) => (
            <Button key={s.label} type="button" variant="secondary" size="sm" onClick={() => onChange(extendExpiry(value, s))}>
              {info.kind === 'expired' && <Unlock />}
              {info.kind === 'active' ? '+ ' : ''}
              {s.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1.5 text-sm font-medium">
          Or pick the last day
          <Input
            type="date"
            className="w-44"
            value={toDateInput(value)}
            onChange={(e) => {
              const v = endOfDay(e.target.value)
              if (v) onChange(v)
            }}
          />
        </label>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            Remove end date
          </Button>
        )}
      </div>
    </div>
  )
}
