import { Building2, ExternalLink, IndianRupee, Wallet } from 'lucide-react'
import { useMemo } from 'react'
import { QrSvg } from '@/components/qr/QrSvg'
import { DEFAULT_DESIGN } from '@/lib/qr/design'
import { UPI_APPS, upiLink } from '@/lib/qr/destinations'
import type { PaymentData } from '@/lib/qr/types'
import { CopyButton } from './actions'
import { CardScope, useCardAccent } from './PageTheme'
import { ActionLink } from './primitives'

function isIos() {
  return typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)
}
function isPhone() {
  return typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

const formatInr = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)

/** Short coloured mark for each UPI app (text only, no third-party logos). */
const APP_MARK: Record<string, { short: string; color: string }> = {
  gpay: { short: 'G', color: '#1A73E8' },
  phonepe: { short: 'Pe', color: '#5F259F' },
  paytm: { short: 'P', color: '#00BAF2' },
  cred: { short: 'C', color: '#111111' },
  bhim: { short: 'B', color: '#F37021' },
}

/**
 * How to pay: UPI (any app, or a specific one), a UPI QR for paying from
 * another phone, payment links and bank details, each with a copy button.
 */
export function PaymentCard({ data, accent: pageAccent, compact }: { data: PaymentData; accent: string; compact?: boolean }) {
  const accent = useCardAccent(pageAccent)
  const upi = upiLink(data)
  const phone = isPhone()
  const ios = isIos()
  const qr = useMemo(() => (upi ? <QrSvg text={upi} design={{ ...DEFAULT_DESIGN, ecl: 'M' }} label="UPI payment QR code" /> : null), [upi])

  return (
    <CardScope>
    <div className="grid gap-4 rounded-2xl border border-line bg-white p-4 text-ink">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: `${accent}14`, color: accent }}>
          <Wallet className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{data.label || (data.payee_name ? `Pay ${data.payee_name}` : 'Pay')}</p>
          {data.amount ? (
            <p className="text-sm text-muted">
              Amount <strong className="text-ink">{formatInr(data.amount)}</strong>
              {data.note ? ` · ${data.note}` : ''}
            </p>
          ) : data.note ? (
            <p className="truncate text-sm text-muted">{data.note}</p>
          ) : null}
        </div>
      </div>

      {upi && (
        <div className="grid gap-3">
          <ActionLink href={upi} accent={accent} variant="solid">
            <IndianRupee /> Pay with any UPI app
          </ActionLink>
          <div className="grid grid-cols-5 gap-2">
            {UPI_APPS.map((app) => {
              const href = upiLink(data, ios ? app.scheme : app.android)!
              const mark = APP_MARK[app.id]
              return (
                <a
                  key={app.id}
                  href={href}
                  className="flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-center text-[0.68rem] font-medium text-ink/80 ring-1 ring-line hover:bg-surface"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: mark.color }} aria-hidden>
                    {mark.short}
                  </span>
                  {app.name}
                </a>
              )
            })}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2">
            <span className="min-w-0">
              <span className="block text-xs text-muted">UPI ID</span>
              <span className="block truncate font-mono text-[0.95rem]">{data.upi_id}</span>
            </span>
            <CopyButton text={data.upi_id!} accent={accent} />
          </div>
          {!compact && (
            <details className="group rounded-xl ring-1 ring-line" open={!phone}>
              <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-muted [&::-webkit-details-marker]:hidden">
                {phone ? 'Paying from another phone? Show the UPI QR code' : 'Scan with any UPI app'}
              </summary>
              <div className="mx-auto w-44 pb-3">{qr}</div>
            </details>
          )}
        </div>
      )}

      {data.links?.map((l) => (
        <ActionLink key={l.url} href={l.url} accent={accent} external variant="outline">
          <ExternalLink /> {l.label}
        </ActionLink>
      ))}

      {data.bank?.account_number && (
        <div className="grid gap-2 rounded-xl bg-surface p-3 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <Building2 className="size-4 text-muted" /> Bank transfer
          </p>
          {data.bank.account_name && <Row label="Account name" value={data.bank.account_name} accent={accent} />}
          <Row label="Account number" value={data.bank.account_number} accent={accent} copy />
          {data.bank.ifsc && <Row label="IFSC" value={data.bank.ifsc} accent={accent} copy />}
          {data.bank.bank_name && <Row label="Bank" value={data.bank.bank_name} accent={accent} />}
        </div>
      )}
      <p className="text-xs text-muted">Check the name shown in your payment app before you pay.</p>
    </div>
    </CardScope>
  )
}

function Row({ label, value, accent, copy }: { label: string; value: string; accent: string; copy?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-xs text-muted">{label}</span>
        <span className="block truncate font-medium tabular">{value}</span>
      </span>
      {copy && <CopyButton text={value} accent={accent} />}
    </div>
  )
}
