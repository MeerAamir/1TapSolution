import { Minus, Plus, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/overlay'
import { formatKb, processImage } from '@/lib/image'
import { cn } from '@/lib/utils'

export interface CropSpec {
  /** Fixed shape (1 = square, 3 = wide banner). Leave out to offer choices. */
  aspect?: number
  /** Shapes to choose from when no fixed aspect is set; null means "as uploaded". */
  aspects?: Array<{ label: string; value: number | null }>
  round?: boolean
  /** Longest side of the saved image, in pixels. */
  maxSide: number
  label?: string
}

const DEFAULT_ASPECTS: CropSpec['aspects'] = [
  { label: 'Original', value: null },
  { label: 'Square', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '16:9', value: 16 / 9 },
]

/**
 * Lets the admin frame a photo (drag to move, slider or pinch to zoom) before
 * upload. The result is resized for its use and compressed, so large phone
 * photos never reach storage.
 */
export function ImageCropDialog({
  file,
  spec,
  onCancel,
  onDone,
}: {
  file: File | null
  spec: CropSpec
  onCancel: () => void
  onDone: (processed: File) => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [natural, setNatural] = useState<number | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState<Area | null>(null)
  const [aspectChoice, setAspectChoice] = useState<number | null>(spec.aspect ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!file) return
    const u = URL.createObjectURL(file)
    setUrl(u)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setAspectChoice(spec.aspect ?? null)
    setError(null)
    const img = new Image()
    img.onload = () => setNatural(img.naturalWidth / img.naturalHeight)
    img.src = u
    return () => URL.revokeObjectURL(u)
  }, [file, spec.aspect])

  const aspects = spec.aspect ? null : (spec.aspects ?? DEFAULT_ASPECTS)
  const aspect = spec.aspect ?? aspectChoice ?? natural ?? 1

  async function finish(useWhole: boolean) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const out = await processImage(file, { area: useWhole ? null : area, maxSide: spec.maxSide })
      onDone(out)
    } catch (e) {
      setError((e as Error).message || 'This image could not be processed. Try a JPG or PNG file.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={Boolean(file)}
      onOpenChange={(v) => !v && !busy && onCancel()}
      title={spec.label ?? 'Adjust the image'}
      description="Drag to move. Use the slider (or pinch on a phone) to zoom. The image is resized and compressed automatically."
      className="max-w-xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => void finish(true)} disabled={busy}>
            Use whole image
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void finish(false)} loading={busy}>
              Use this
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4">
        <div className="relative h-72 overflow-hidden rounded-xl bg-midnight sm:h-80">
          {url && (
            <Cropper
              image={url}
              crop={crop}
              zoom={zoom}
              minZoom={1}
              maxZoom={5}
              aspect={aspect}
              cropShape={spec.round ? 'round' : 'rect'}
              showGrid={!spec.round}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, px) => setArea(px)}
              objectFit="contain"
            />
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(1, z - 0.25))}>
            <Minus />
          </Button>
          <input
            type="range"
            aria-label="Zoom"
            min={1}
            max={5}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-signal"
          />
          <Button variant="ghost" size="icon" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(5, z + 0.25))}>
            <Plus />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Reset"
            onClick={() => {
              setZoom(1)
              setCrop({ x: 0, y: 0 })
            }}
          >
            <RotateCcw />
          </Button>
        </div>
        {aspects && (
          <div role="radiogroup" aria-label="Shape" className="flex flex-wrap gap-2">
            {aspects.map((a) => (
              <button
                key={a.label}
                type="button"
                role="radio"
                aria-checked={aspectChoice === a.value}
                onClick={() => setAspectChoice(a.value)}
                className={cn(
                  'h-8 rounded-full px-3 text-sm font-medium ring-1',
                  aspectChoice === a.value ? 'bg-signal text-white ring-signal' : 'bg-white text-ink ring-line hover:ring-line-strong',
                )}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted">
          {file ? `Original ${formatKb(file.size)}. ` : ''}Saved at up to {spec.maxSide} px, usually under 300 KB.
        </p>
        {error && <p className="text-sm font-medium text-danger">{error}</p>}
      </div>
    </Dialog>
  )
}
