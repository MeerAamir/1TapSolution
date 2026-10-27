import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { vcardText } from '@/lib/qr/destinations'
import type { DestinationByType } from '@/lib/qr/types'
import { cn } from '@/lib/utils'

/** Saves a vCard to the visitor's phone ("Add to contacts"). */
export function downloadVcard(card: DestinationByType['contact_card']) {
  const blob = new Blob([vcardText(card)], { type: 'text/vcard;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${card.full_name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'contact'}.vcf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Older browsers / insecure contexts.
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

export function CopyButton({ text, label = 'Copy', accent, className }: { text: string; label?: string; accent: string; className?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true)
          setTimeout(() => setDone(false), 1600)
        }
      }}
      className={cn('inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold ring-1 ring-inset transition-colors', className)}
      style={{ color: accent, boxShadow: `inset 0 0 0 1.5px ${accent}40` }}
    >
      {done ? <Check className="size-4" /> : <Copy className="size-4" />} {done ? 'Copied' : label}
    </button>
  )
}
