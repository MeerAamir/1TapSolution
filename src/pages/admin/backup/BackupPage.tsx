import { Archive, CheckCircle2, Download, FileJson, FileSpreadsheet, FolderArchive, Images, Info, QrCode } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, PageHeader } from '@/components/ui/data'
import { Notice } from '@/components/ui/feedback'
import { Field, Input, Select, Switch } from '@/components/ui/form'
import { listBusinessOptions, workspaceBusinessId } from '@/lib/admin-api'
import { buildBackup, type BackupOptions, type BackupPeriod, type BackupResult } from '@/lib/backup'
import { downloadBlob } from '@/lib/qr/export'
import { friendlyError } from '@/lib/supabase'
import { useQuery } from '@/lib/use-query'
import { cn, formatBytes, formatNumber } from '@/lib/utils'

const PERIODS: Array<[BackupPeriod, string]> = [
  ['all', 'Everything'],
  ['today', 'Today'],
  ['month', 'This month'],
  ['30d', 'Last 30 days'],
  ['custom', 'Choose dates'],
]

export default function BackupPage() {
  const businesses = useQuery(listBusinessOptions, [])
  const [business, setBusiness] = useState('')
  const [period, setPeriod] = useState<BackupPeriod>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [qrImages, setQrImages] = useState(true)
  const [pngImages, setPngImages] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState(true)
  const [scans, setScans] = useState(false)
  const [step, setStep] = useState<string | null>(null)
  const [done, setDone] = useState<(BackupResult & { size: number }) | null>(null)

  async function run() {
    setDone(null)
    setStep('Starting…')
    try {
      const businessId = business === 'none' ? await workspaceBusinessId() : business
      const opts: BackupOptions = { period, from, to, businessId, qrImages, pngImages: qrImages && pngImages, uploadedFiles, scans }
      const r = await buildBackup(opts, setStep)
      downloadBlob(r.blob, r.filename)
      setDone({ ...r, size: r.blob.size })
      toast.success('Backup downloaded')
    } catch (e) {
      toast.error(`Backup failed: ${friendlyError(e)}`)
    } finally {
      setStep(null)
    }
  }

  return (
    <>
      <PageHeader title="Backup" description="Download all your QR codes, pages, businesses and files in one ZIP, so nothing is ever lost." />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader title="Make a backup" description="Choose what to include, then download." />
          <div className="grid gap-6 p-5">
            <Field label="Business">
              {(p) => (
                <Select {...p} value={business} onChange={(e) => setBusiness(e.target.value)}>
                  <option value="">All businesses and codes</option>
                  <option value="none">Codes with no business</option>
                  {businesses.data?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <div className="grid gap-2">
              <p className="text-sm font-medium">Which codes</p>
              <div role="radiogroup" aria-label="Period" className="flex flex-wrap gap-1 rounded-xl bg-surface p-1 ring-1 ring-line">
                {PERIODS.map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={period === v}
                    onClick={() => setPeriod(v)}
                    className={cn('flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium', period === v ? 'bg-white text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink')}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted">
                {period === 'all' ? 'Every code, page and business: a complete backup.' : 'Codes created or changed in this period, with their pages, pictures and businesses.'}
              </p>
              {period === 'custom' && (
                <div className="flex flex-wrap gap-3">
                  <Field label="From">{(p) => <Input {...p} type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />}</Field>
                  <Field label="To">{(p) => <Input {...p} type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />}</Field>
                </div>
              )}
            </div>

            <div className="grid gap-3">
              <p className="text-sm font-medium">Include</p>
              <Switch checked={qrImages} onCheckedChange={setQrImages} label="QR code images" description="Every code as a print-ready SVG, with its design and logo." />
              {qrImages && <Switch checked={pngImages} onCheckedChange={setPngImages} label="Also as PNG pictures" description="Takes longer with many codes." />}
              <Switch checked={uploadedFiles} onCheckedChange={setUploadedFiles} label="Uploaded pictures and PDFs" description="Logos, menu photos, galleries, PDFs. Makes the ZIP bigger." />
              <Switch checked={scans} onCheckedChange={setScans} label="Scan history" description="Every recorded scan as a spreadsheet (time, code, device)." />
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
              <Button size="lg" onClick={() => void run()} loading={step !== null} disabled={period === 'custom' && !from && !to}>
                {step === null && <Download />} {step ?? 'Download backup'}
              </Button>
              <span className="text-xs text-muted">Made in your browser and saved straight to this device.</span>
            </div>

            {done && (
              <Notice tone="success">
                <p className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="size-4" /> {done.filename} ({formatBytes(done.size)})
                </p>
                <p className="mt-1">
                  {formatNumber(done.counts.qr)} QR codes, {formatNumber(done.counts.businesses)} businesses, {formatNumber(done.counts.blocks)} page items,{' '}
                  {formatNumber(done.counts.files)} files{scans ? `, ${formatNumber(done.counts.scans)} scans` : ''}.
                  {done.counts.missing ? ` ${done.counts.missing} item(s) could not be added.` : ''}
                </p>
              </Notice>
            )}
          </div>
        </Card>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader title="What is in the ZIP" />
            <ul className="grid gap-3 p-5 text-sm">
              {(
                [
                  [<FileJson key="j" />, 'backup.json', 'All records, ready to load into a new database'],
                  [<FileSpreadsheet key="c" />, 'qr-codes.csv', 'Opens in Excel or Google Sheets'],
                  [<QrCode key="q" />, 'qr-images', 'Every code, ready to print again'],
                  [<Images key="i" />, 'files', 'Your pictures and PDFs'],
                  [<Info key="r" />, 'README.txt', 'How to restore'],
                ] as const
              ).map(([icon, name, text]) => (
                <li key={name} className="flex gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-signal-soft text-signal [&_svg]:size-4">{icon}</span>
                  <span>
                    <span className="block font-medium">{name}</span>
                    <span className="text-muted">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Notice tone="info">
            <p className="flex items-center gap-1.5 font-semibold">
              <Archive className="size-4" /> Keep printed codes safe
            </p>
            <p className="mt-1">
              Each code’s permanent link (<code>/q/…</code>) is in the backup. Any new website that answers those links keeps every printed code working. Save a full backup each month to Google Drive or
              email.
            </p>
          </Notice>
          <Notice tone="info">
            <p className="flex items-center gap-1.5 font-semibold">
              <FolderArchive className="size-4" /> Automatic database copies
            </p>
            <p className="mt-1">The weekly GitHub backup (see the hosting guide) keeps an extra copy of the database without you doing anything.</p>
          </Notice>
        </div>
      </div>
    </>
  )
}
