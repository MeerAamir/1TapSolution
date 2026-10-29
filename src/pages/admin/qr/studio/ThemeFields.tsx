import { Check, Loader2, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { UploadButton } from '@/components/admin/FilePicker'
import { PAGE_FONTS } from '@/components/public/PageTheme'
import { Button } from '@/components/ui/button'
import { ColorInput, Field, Select } from '@/components/ui/form'
import { storagePublicUrl } from '@/config'
import { dominantColors, IMAGE_PRESETS, tint } from '@/lib/image'
import type { PageFont, PageTheme } from '@/lib/qr/types'
import type { FileRecord } from '@/lib/types'
import { cn } from '@/lib/utils'

const SWATCHES = ['#2563EB', '#7C3AED', '#DB2777', '#DC2626', '#EA580C', '#CA8A04', '#16A34A', '#0D9488', '#0F172A']

/** Ready-made looks: one tap, then adjust anything. */
const PRESETS: Array<{ name: string; theme: PageTheme }> = [
  { name: 'Clean', theme: { accent: '#2563EB', bg_type: 'soft', font: 'inter', button_style: 'outline', button_shape: 'rounded' } },
  { name: 'Café', theme: { accent: '#9A3412', bg_type: 'gradient', bg_color: '#FFEDD5', bg_color2: '#FFFBEB', bg_angle: 160, font: 'lora', button_style: 'solid', button_shape: 'pill' } },
  { name: 'Elegant', theme: { accent: '#D4A64A', bg_type: 'solid', bg_color: '#111827', font: 'playfair', button_style: 'outline', button_shape: 'square' } },
  { name: 'Fresh', theme: { accent: '#15803D', bg_type: 'gradient', bg_color: '#DCFCE7', bg_color2: '#F0FDF4', bg_angle: 180, font: 'nunito', button_style: 'soft', button_shape: 'pill' } },
  { name: 'Bold', theme: { accent: '#6D28D9', bg_type: 'gradient', bg_color: '#7C3AED', bg_color2: '#DB2777', bg_angle: 135, font: 'montserrat', button_style: 'solid', button_shape: 'pill', button_color: '#FFFFFF', button_text_color: '#5B21B6' } },
  { name: 'Ocean', theme: { accent: '#0E7490', bg_type: 'gradient', bg_color: '#CFFAFE', bg_color2: '#EFF6FF', bg_angle: 200, font: 'poppins', button_style: 'solid', button_shape: 'rounded' } },
]

function presetBackground(t: PageTheme): string {
  if (t.bg_type === 'solid') return t.bg_color ?? '#F8FAFC'
  if (t.bg_type === 'gradient') return `linear-gradient(${t.bg_angle ?? 160}deg, ${t.bg_color}, ${t.bg_color2})`
  return `linear-gradient(180deg, ${t.accent}26, #F8FAFC)`
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 rounded-xl bg-surface p-1 ring-1 ring-line">
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn('flex-1 rounded-lg px-2.5 py-1.5 text-sm font-medium', value === v ? 'bg-white text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink')}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

/** Fonts, colours, background and buttons of a visitor page. */
export function ThemeFields({
  value,
  onChange,
  fallbackAccent,
  files,
  businessId,
  onFileAdded,
  matchImages,
}: {
  value: PageTheme | undefined
  onChange: (t: PageTheme | undefined) => void
  fallbackAccent: string
  files: Map<string, FileRecord>
  businessId: string | null
  onFileAdded: (f: FileRecord) => void
  /** Banner, logo or profile picture to take colours from. */
  matchImages: FileRecord[]
}) {
  const t = value ?? {}
  const set = (patch: Partial<PageTheme>) => {
    const next = { ...t, ...patch }
    for (const k of Object.keys(next) as Array<keyof PageTheme>) if (next[k] === undefined || next[k] === '') delete next[k]
    onChange(Object.keys(next).length ? next : undefined)
  }
  const accent = t.accent ?? fallbackAccent
  const bgType = t.bg_type ?? 'soft'
  const bgImage = t.bg_image_file_id ? files.get(t.bg_image_file_id) : undefined
  const [matching, setMatching] = useState(false)

  async function matchColours() {
    const img = matchImages[0]
    if (!img) return
    setMatching(true)
    try {
      const colours = await dominantColors(storagePublicUrl(img.storage_path, img.version))
      if (!colours.length) throw new Error('No clear colours found in that picture.')
      const [main, second = main] = colours
      set({ accent: main, bg_type: 'gradient', bg_color: tint(main, 0.82), bg_color2: tint(second, 0.94), bg_angle: 160, button_color: undefined, button_text_color: undefined })
      toast.success('Colours taken from your picture. Adjust anything below.')
    } catch (e) {
      toast.error((e as Error).message || 'Could not read the picture colours.')
    } finally {
      setMatching(false)
    }
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <p className="text-sm font-medium">Ready-made looks</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => onChange({ ...p.theme })}
              className="group grid gap-1 text-center text-xs font-medium"
              aria-label={`Use the ${p.name} look`}
            >
              <span className="grid h-14 place-items-center rounded-xl ring-1 ring-line transition-transform group-hover:-translate-y-0.5" style={{ background: presetBackground(p.theme) }}>
                <span className="h-2.5 w-10 rounded-full" style={{ backgroundColor: p.theme.button_color ?? p.theme.accent }} />
              </span>
              {p.name}
            </button>
          ))}
        </div>
        {matchImages.length > 0 && (
          <Button variant="secondary" size="sm" className="justify-self-start" onClick={() => void matchColours()} disabled={matching}>
            {matching ? <Loader2 className="animate-spin" /> : <Wand2 />} Match my banner / logo colours
          </Button>
        )}
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-medium">Main colour</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-pressed={accent.toUpperCase() === c}
              onClick={() => set({ accent: c })}
              className="grid h-8 w-8 place-items-center rounded-full ring-1 ring-black/10"
              style={{ backgroundColor: c }}
            >
              {accent.toUpperCase() === c && <Check className="size-4 text-white" />}
            </button>
          ))}
          <ColorInput value={accent} onChange={(v) => /^#[0-9a-fA-F]{6}$/.test(v) && set({ accent: v.toUpperCase() })} />
        </div>
      </div>

      <Field label="Font">
        {(p) => (
          <Select {...p} value={t.font ?? 'inter'} onChange={(e) => set({ font: e.target.value === 'inter' ? undefined : (e.target.value as PageFont) })}>
            {(Object.keys(PAGE_FONTS) as PageFont[]).map((f) => (
              <option key={f} value={f}>
                {PAGE_FONTS[f].label}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <div className="grid gap-3">
        <p className="text-sm font-medium">Background</p>
        <Seg
          label="Background"
          value={bgType}
          onChange={(v) => set({ bg_type: v === 'soft' ? undefined : v, bg_color: v === 'solid' || v === 'gradient' ? (t.bg_color ?? tint(accent, 0.85)) : t.bg_color })}
          options={[
            ['soft', 'Soft'],
            ['solid', 'Colour'],
            ['gradient', 'Gradient'],
            ['image', 'Picture'],
          ]}
        />
        {(bgType === 'solid' || bgType === 'gradient') && (
          <div className="flex flex-wrap items-end gap-4">
            <Field label={bgType === 'gradient' ? 'From' : 'Colour'}>
              {(p) => <ColorInput {...p} value={t.bg_color ?? '#F8FAFC'} onChange={(v) => /^#[0-9a-fA-F]{6}$/.test(v) && set({ bg_color: v.toUpperCase() })} />}
            </Field>
            {bgType === 'gradient' && (
              <>
                <Field label="To">
                  {(p) => <ColorInput {...p} value={t.bg_color2 ?? '#FFFFFF'} onChange={(v) => /^#[0-9a-fA-F]{6}$/.test(v) && set({ bg_color2: v.toUpperCase() })} />}
                </Field>
                <Field label={`Direction: ${t.bg_angle ?? 160}°`} className="min-w-40 flex-1">
                  {(p) => (
                    <input {...p} type="range" min={0} max={360} step={5} value={t.bg_angle ?? 160} onChange={(e) => set({ bg_angle: Number(e.target.value) })} className="accent-signal" />
                  )}
                </Field>
              </>
            )}
          </div>
        )}
        {bgType === 'image' && (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {bgImage && <img src={storagePublicUrl(bgImage.storage_path, bgImage.version)} alt="" className="h-16 w-28 rounded-lg object-cover ring-1 ring-line" />}
              <UploadButton
                businessId={businessId}
                kind="image"
                variant={bgImage ? 'secondary' : 'primary'}
                label={bgImage ? 'Change picture' : 'Upload background picture'}
                crop={{ maxSide: IMAGE_PRESETS.content.maxSide, label: 'Adjust the background', aspects: [{ label: 'Original', value: null }, { label: 'Phone (9:16)', value: 9 / 16 }, { label: 'Square', value: 1 }] }}
                onUploaded={(f) => {
                  onFileAdded(f)
                  set({ bg_image_file_id: f.id })
                }}
              />
            </div>
            <Field label={`Darken the picture: ${Math.round((t.bg_overlay ?? 0.35) * 100)}%`} hint="Keeps text readable on busy photos.">
              {(p) => (
                <input {...p} type="range" min={0} max={0.9} step={0.05} value={t.bg_overlay ?? 0.35} onChange={(e) => set({ bg_overlay: Number(e.target.value) })} className="accent-signal" />
              )}
            </Field>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <p className="text-sm font-medium">Buttons</p>
          <Seg
            label="Button style"
            value={t.button_style ?? 'outline'}
            onChange={(v) => set({ button_style: v === 'outline' ? undefined : v })}
            options={[
              ['outline', 'Outline'],
              ['solid', 'Filled'],
              ['soft', 'Soft'],
            ]}
          />
        </div>
        <div className="grid gap-2">
          <p className="text-sm font-medium">Corners</p>
          <Seg
            label="Button corners"
            value={t.button_shape ?? 'rounded'}
            onChange={(v) => set({ button_shape: v === 'rounded' ? undefined : v })}
            options={[
              ['rounded', 'Rounded'],
              ['pill', 'Round'],
              ['square', 'Sharp'],
            ]}
          />
        </div>
      </div>

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-signal">Text and button colours</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {(
            [
              ['title_color', 'Titles and names'],
              ['text_color', 'Other text'],
              ['button_color', 'Buttons'],
              ['button_text_color', 'Text on filled buttons'],
            ] as const
          ).map(([k, label]) => (
            <div key={k} className="grid gap-1.5">
              <p className="text-sm font-medium">{label}</p>
              <div className="flex items-center gap-2">
                <ColorInput value={t[k] ?? '#0F172A'} onChange={(v) => /^#[0-9a-fA-F]{6}$/.test(v) && set({ [k]: v.toUpperCase() })} />
                {t[k] ? (
                  <button type="button" className="text-xs font-medium text-muted hover:text-ink" onClick={() => set({ [k]: undefined })}>
                    Automatic
                  </button>
                ) : (
                  <span className="text-xs text-muted">Automatic</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </details>

      {value && (
        <button type="button" className="justify-self-start text-sm font-medium text-muted hover:text-ink" onClick={() => onChange(undefined)}>
          Reset to the default look
        </button>
      )}
    </div>
  )
}
