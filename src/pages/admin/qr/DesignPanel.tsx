import { AlertTriangle, ShieldAlert } from 'lucide-react'
import { ColorInput, Field, Input, Select, Switch } from '@/components/ui/form'
import { DEFAULT_DESIGN, designWarnings, effectiveEcl, type QrDesign } from '@/lib/qr/design'
import { cn } from '@/lib/utils'

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-surface p-1 ring-1 ring-line">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            value === o.value ? 'bg-white text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function DesignWarnings({ design }: { design: QrDesign }) {
  const warnings = designWarnings(design)
  if (!warnings.length) return null
  return (
    <ul className="grid gap-2">
      {warnings.map((w) => (
        <li
          key={w.message}
          className={cn(
            'flex gap-2 rounded-lg px-3 py-2 text-xs leading-relaxed',
            w.level === 'danger' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning',
          )}
        >
          {w.level === 'danger' ? <ShieldAlert className="mt-0.5 size-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />}
          <span className="text-ink/80">{w.message}</span>
        </li>
      ))}
    </ul>
  )
}

export function DesignPanel({
  design,
  onChange,
  hasLogo,
}: {
  design: QrDesign
  onChange: (d: QrDesign) => void
  hasLogo: boolean
}) {
  const set = <K extends keyof QrDesign>(k: K, v: QrDesign[K]) => onChange({ ...design, [k]: v })
  return (
    <div className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Code colour">{(p) => <ColorInput {...p} value={design.fg} onChange={(v) => /^#[0-9a-fA-F]{6}$/.test(v) && set('fg', v)} />}</Field>
        <Field label="Background">{(p) => <ColorInput {...p} value={design.bg} onChange={(v) => /^#[0-9a-fA-F]{6}$/.test(v) && set('bg', v)} />}</Field>
      </div>
      <div className="grid gap-2">
        <p className="text-sm font-medium">Module style</p>
        <Segmented
          label="Module style"
          value={design.dots}
          onChange={(v) => set('dots', v)}
          options={[
            { value: 'square', label: 'Square' },
            { value: 'rounded', label: 'Rounded' },
            { value: 'dots', label: 'Dots' },
          ]}
        />
      </div>
      <div className="grid gap-2">
        <p className="text-sm font-medium">Corner markers</p>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label="Corner marker style"
            value={design.eyes}
            onChange={(v) => set('eyes', v)}
            options={[
              { value: 'square', label: 'Square' },
              { value: 'rounded', label: 'Rounded' },
              { value: 'circle', label: 'Circle' },
            ]}
          />
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(design.eyeColor)}
              onChange={(e) => set('eyeColor', e.target.checked ? '#7C3AED' : undefined)}
              className="size-4 accent-signal"
            />
            Different colour
          </label>
        </div>
        {design.eyeColor && (
          <ColorInput value={design.eyeColor} onChange={(v) => /^#[0-9a-fA-F]{6}$/.test(v) && set('eyeColor', v)} />
        )}
      </div>

      <div className="grid gap-4 rounded-xl border border-line p-4">
        <Switch
          checked={design.logo}
          disabled={!hasLogo}
          onCheckedChange={(v) => set('logo', v)}
          label="Business logo in the centre"
          description={hasLogo ? 'Error correction is raised automatically to keep the code readable.' : 'Add a logo to the business first.'}
        />
        {design.logo && (
          <Field label={`Logo size: ${Math.round(design.logoScale * 100)}% of the code`}>
            {(p) => (
              <input
                {...p}
                type="range"
                min={0.12}
                max={0.26}
                step={0.01}
                value={design.logoScale}
                onChange={(e) => set('logoScale', Number(e.target.value))}
                className="accent-signal"
              />
            )}
          </Field>
        )}
        <Switch checked={design.frame} onCheckedChange={(v) => set('frame', v)} label="Frame with call to action" />
        {design.frame && (
          <Field label="Call to action">
            {(p) => <Input {...p} maxLength={32} placeholder="Scan for menu" value={design.cta ?? ''} onChange={(e) => set('cta', e.target.value || undefined)} />}
          </Field>
        )}
        <Switch checked={design.showName} onCheckedChange={(v) => set('showName', v)} label="Business name under the code" />
        <Switch checked={design.border} onCheckedChange={(v) => set('border', v)} label="Thin border" />
      </div>

      <Field
        label="Error correction"
        hint={`Higher levels survive damage and logos but make the pattern denser. In use: ${effectiveEcl(design)}.`}
      >
        {(p) => (
          <Select {...p} value={design.ecl} onChange={(e) => set('ecl', e.target.value as QrDesign['ecl'])} className="max-w-xs">
            <option value="L">L, about 7% recovery</option>
            <option value="M">M, about 15% recovery (default)</option>
            <option value="Q">Q, about 25% recovery</option>
            <option value="H">H, about 30% recovery</option>
          </Select>
        )}
      </Field>
      <button
        type="button"
        className="justify-self-start text-sm font-medium text-signal hover:underline"
        onClick={() => onChange({ ...DEFAULT_DESIGN })}
      >
        Reset to high-contrast default
      </button>
    </div>
  )
}
