import { AlertCircle, Check, CheckCircle2, Copy, Download, ExternalLink, FileDown, Loader2, PauseCircle, Printer, Share2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { QrSvg } from '@/components/qr/QrSvg'
import { Button } from '@/components/ui/button'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/overlay'
import type { QrDesign } from '@/lib/qr/design'
import { downloadPdf, downloadPng, downloadSvg, imageUrlToDataUrl, printQr, safeFilename, shareQr } from '@/lib/qr/export'
import { cn } from '@/lib/utils'

export type LiveState =
  | { kind: 'incomplete'; message: string }
  | { kind: 'saving' }
  | { kind: 'live' }
  | { kind: 'paused'; message: string }
  | { kind: 'error'; message: string }

function StatusLine({ state, isStatic }: { state: LiveState; isStatic: boolean }) {
  const map = {
    incomplete: { icon: <AlertCircle />, cls: 'bg-surface text-muted ring-line', text: (state as { message?: string }).message },
    saving: { icon: <Loader2 className="animate-spin" />, cls: 'bg-signal-soft text-signal ring-signal/20', text: 'Saving…' },
    live: {
      icon: <CheckCircle2 />,
      cls: 'bg-success-soft text-success ring-success/20',
      text: isStatic ? 'Saved. Ready to print.' : 'Saved and live. Scan it now.',
    },
    paused: { icon: <PauseCircle />, cls: 'bg-warning-soft text-warning ring-warning/20', text: (state as { message?: string }).message },
    error: { icon: <AlertCircle />, cls: 'bg-danger-soft text-danger ring-danger/20', text: (state as { message?: string }).message },
  }[state.kind]
  return (
    <p role="status" className={cn('flex items-start gap-2 rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-inset [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0', map.cls)}>
      {map.icon}
      <span>{map.text}</span>
    </p>
  )
}

/** The code itself, its live status and every way to get it out: download, share, print. */
export function StudioQrCard({
  content,
  design,
  name,
  publicUrl,
  isStatic,
  state,
  logoUrl,
}: {
  content: string
  design: QrDesign
  name: string
  publicUrl?: string
  isStatic: boolean
  state: LiveState
  logoUrl?: string
}) {
  const [logoDataUrl, setLogoDataUrl] = useState<string>()
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true
    if (design.logo && logoUrl) imageUrlToDataUrl(logoUrl).then((d) => active && setLogoDataUrl(d))
    else setLogoDataUrl(undefined)
    return () => {
      active = false
    }
  }, [design.logo, logoUrl])

  const opts = { logoDataUrl }
  const file = safeFilename(name || 'qr-code')

  async function run(kind: string, fn: () => Promise<unknown> | unknown) {
    setBusy(kind)
    try {
      await fn()
    } catch (e) {
      toast.error((e as Error).message || 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="grid gap-3 p-4">
        <StatusLine state={state} isStatic={isStatic} />
        <div className="mx-auto w-full max-w-[16rem] rounded-xl bg-surface p-3">
          <QrSvg text={content} design={design} logoDataUrl={logoDataUrl} label={`QR code for ${name}`} />
        </div>
        {publicUrl && (
          <div className="flex items-center gap-1.5">
            <code className="min-w-0 flex-1 truncate rounded-md bg-surface px-2.5 py-1.5 text-xs ring-1 ring-line">{publicUrl.replace(/^https?:\/\//, '')}</code>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Copy link"
              onClick={async () => {
                await navigator.clipboard.writeText(publicUrl)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              {copied ? <Check className="text-success" /> : <Copy />}
            </Button>
            <Button asChild variant="ghost" size="icon" aria-label="Open the link (not counted as a scan)">
              <a href={`${publicUrl}?preview=1`} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
              </a>
            </Button>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          <Menu>
            <MenuTrigger asChild>
              <Button variant="primary" className="px-2" loading={busy === 'png' || busy === 'pdf'}>
                {busy !== 'png' && busy !== 'pdf' && <Download />} Download
              </Button>
            </MenuTrigger>
            <MenuContent align="start">
              <MenuItem onSelect={() => run('png', () => downloadPng(content, design, opts, file, 2048))}>
                <Download /> PNG image (best for most uses)
              </MenuItem>
              <MenuItem onSelect={() => run('png', () => downloadPng(content, design, opts, file, 4096))}>
                <Download /> PNG, extra large (posters)
              </MenuItem>
              <MenuItem onSelect={() => run('svg', () => downloadSvg(content, design, opts, file))}>
                <FileDown /> SVG vector (for designers)
              </MenuItem>
              <MenuItem onSelect={() => run('pdf', () => downloadPdf(content, design, { ...opts, businessName: name }, file))}>
                <FileDown /> PDF, ready to print
              </MenuItem>
            </MenuContent>
          </Menu>
          <Button
            variant="secondary"
            className="px-2"
            loading={busy === 'share'}
            onClick={() =>
              run('share', async () => {
                const r = await shareQr(content, design, opts, name, publicUrl)
                if (r === 'copied') toast.success('Link copied. Paste it in WhatsApp, email or anywhere.')
                if (r === 'failed') toast.error('Sharing is not available here. Use Download instead.')
              })
            }
          >
            {busy !== 'share' && <Share2 />} Share
          </Button>
          <Button variant="secondary" className="px-2" onClick={() => run('print', () => printQr(content, design, opts, name))}>
            <Printer /> Print
          </Button>
        </div>
        {publicUrl && (
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`${name}\n${publicUrl}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-center text-xs font-medium text-muted hover:text-ink"
          >
            Send the link on WhatsApp
          </a>
        )}
      </div>
    </div>
  )
}
