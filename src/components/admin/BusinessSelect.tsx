import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/form'
import { quickBusiness } from '@/lib/admin-api'
import { friendlyError } from '@/lib/supabase'

export interface BusinessOption {
  id: string
  name: string
  is_demo?: boolean
}

const NEW = '__new__'

/**
 * Pick which business a QR code belongs to, "No business", or type a new
 * business name on the spot.
 */
export function BusinessSelect({
  value,
  onChange,
  businesses,
  onCreated,
  allowNone = true,
  id,
  className,
  disabled,
}: {
  /** null = no business */
  value: string | null
  onChange: (id: string | null) => void
  businesses: BusinessOption[]
  onCreated?: (b: BusinessOption) => void
  allowNone?: boolean
  id?: string
  className?: string
  disabled?: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function create() {
    const n = name.trim()
    if (!n) return
    setBusy(true)
    try {
      const newId = await quickBusiness(n)
      onCreated?.({ id: newId, name: n })
      onChange(newId)
      setAdding(false)
      setName('')
      toast.success(`Business “${n}” added`)
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  if (adding) {
    return (
      <div className={className}>
        <div className="flex gap-2">
          <Input
            id={id}
            autoFocus
            aria-label="New business name"
            placeholder="Business name, e.g. Hotel Park Plaza"
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void create()
              }
              if (e.key === 'Escape') setAdding(false)
            }}
          />
          <Button type="button" onClick={() => void create()} loading={busy} disabled={!name.trim()}>
            {!busy && <Plus />} Add
          </Button>
          <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Select
      id={id}
      aria-label="Business"
      className={className}
      disabled={disabled}
      value={value ?? ''}
      onChange={(e) => {
        if (e.target.value === NEW) setAdding(true)
        else onChange(e.target.value || null)
      }}
    >
      {allowNone && <option value="">No business</option>}
      {!allowNone && !value && <option value="">Choose a business</option>}
      {businesses.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
          {b.is_demo && !b.name.includes('(Demo)') ? ' (Demo)' : ''}
        </option>
      ))}
      <option value={NEW}>＋ New business…</option>
    </Select>
  )
}
