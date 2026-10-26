import { Check, Copy, Download, ExternalLink, FileDown, Printer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { QrSvg } from '@/components/qr/QrSvg'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/data'
import { Select } from '@/components/ui/form'
import type { QrDesign } from '@/lib/qr/design'
import { downloadPdf, downloadPng, downloadSvg, imageUrlToDataUrl, safeFilename } from '@/lib/qr/export'
import { DesignWarnings } from './DesignPanel'

export function QrPreviewPanel({
  content,
  design,
  businessName,
  logoUrl,
  publicUrl,
  saved,
  isStatic,
  filename,
  unsavedDesign,
}: {
  /** What the code encodes. */
  content: string
  design: QrDesign
  businessName?: string
  logoUrl?: string
  /** The permanent /q/ link (dynamic codes, once saved). */
  publicUrl?: string
  saved: boolean
  isStatic: boolean
  filename: string
  unsavedDesign: boolean
}) {
  const [logoDataUrl, setLogoDataUrl] = useState<string>()
  const [pngSize, setPngSize] = useState('2048')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (design.logo && logoUrl) imageUrlToDataUrl(logoUrl).then((d) => active && setLogoDataUrl(d))
    else setLogoDataUrl(undefined)
    return () => {
      active = false
    }
  }, [design.logo, logoUrl])

  const opts = { businessName, logoDataUrl }
  const name = safeFilename(filename)
  const canDownload = saved || isStatic

  async function run(kind: string, fn: () => Promise<void> | void) {
    setBusy(kind)
    try {
      await fn()
    } catch (e) {
      toast.error((e as Error).message || 'Download failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="min-w-0 overflow-hidden">
      <div className="bg-surface p-6">
        <div className="mx-auto max-w-[15rem]">
          <QrSvg text={content} design={design} businessName={businessName} logoDataUrl={logoDataUrl} label="QR code preview" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 p-5">
        {publicUrl && (
          <div>
            <p className="text-xs font-medium text-muted">Permanent link, printed in the code</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-surface px-2.5 py-1.5 text-xs ring-1 ring-line">{publicUrl}</code>
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
              <Button asChild variant="ghost" size="icon" aria-label="Test the link (not counted as a scan)">
                <a href={`${publicUrl}?preview=1`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink />
                </a>
              </Button>
            </div>
          </div>
        )}
        {!saved && !isStatic && (
          <p className="text-xs leading-relaxed text-muted">
            Preview only. The permanent link is created when you save, and downloads become available then.
          </p>
        )}

        <DesignWarnings design={design} />

        <div className="grid gap-2">
          <div className="grid grid-cols-[6.75rem_minmax(0,1fr)] gap-2">
            <Select aria-label="PNG size" value={pngSize} onChange={(e) => setPngSize(e.target.value)} className="h-10" disabled={!canDownload}>
              <option value="1024">1024 px</option>
              <option value="2048">2048 px</option>
              <option value="4096">4096 px</option>
            </Select>
            <Button
              variant="secondary"
              className="min-w-0"
              disabled={!canDownload}
              loading={busy === 'png'}
              onClick={() => run('png', () => downloadPng(content, design, opts, name, Number(pngSize)))}
            >
              {busy !== 'png' && <Download />} PNG
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 [&>button]:min-w-0 [&>button]:px-2">
            <Button variant="secondary" disabled={!canDownload} onClick={() => run('svg', () => downloadSvg(content, design, opts, name))}>
              <FileDown /> SVG
            </Button>
            <Button
              variant="secondary"
              disabled={!canDownload}
              loading={busy === 'pdf'}
              onClick={() => run('pdf', () => downloadPdf(content, design, { ...opts, businessName }, name))}
            >
              {busy !== 'pdf' && <Printer />} Print PDF
            </Button>
          </div>
          {unsavedDesign && canDownload && <p className="text-xs text-warning">Downloads use the design shown, including unsaved changes.</p>}
        </div>
        <p className="text-xs leading-relaxed text-muted">
          Before a large print run, print one copy at the final size and scan it with two or three different phones.
          Keep the white margin around the code.
        </p>
      </div>
    </Card>
  )
}
