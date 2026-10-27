import { z } from 'zod'
import { SOCIAL_PLATFORMS, type QrType } from '@/lib/qr/types'
import { email, httpUrl, phone } from './common'

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer`)
    .optional()
    .transform((v) => (v ? v : undefined))

/** Destination schema per QR type — mirrors public.is_valid_qr_destination(). */
export const destinationSchemas: Record<QrType, z.ZodType> = {
  business_profile: z.object({}).strip(),
  landing_page: z.object({
    title: opt(160),
    subtitle: opt(300),
    accent: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Choose a colour')
      .optional(),
    avatar_file_id: z.string().uuid().optional(),
    cover_file_id: z.string().uuid().optional(),
    show_business: z.boolean().optional(),
  }),
  text: z.object({
    title: opt(160),
    text: z.string().trim().min(1, 'Type the text to show').max(4000, 'Use 4,000 characters or fewer'),
  }),
  document: z.object({ open_mode: z.enum(['page', 'direct']).default('page') }),
  website: z.object({ url: httpUrl }),
  custom_link: z.object({ url: httpUrl }),
  social: z.object({ platform: z.enum([...SOCIAL_PLATFORMS]), url: httpUrl }),
  phone: z.object({ phone, label: opt(80) }),
  whatsapp: z.object({ phone, message: opt(500) }),
  email: z.object({ email, subject: opt(200), body: opt(1000) }),
  maps: z
    .object({
      mode: z.enum(['url', 'coordinates']),
      url: z.string().trim().optional(),
      latitude: z.coerce.number().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90').optional(),
      longitude: z.coerce.number().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180').optional(),
      label: opt(120),
    })
    .superRefine((d, ctx) => {
      if (d.mode === 'url' && !httpUrl.safeParse(d.url ?? '').success) {
        ctx.addIssue({ code: 'custom', path: ['url'], message: 'Paste a Google Maps link starting with https://' })
      }
      if (d.mode === 'coordinates' && (d.latitude === undefined || Number.isNaN(d.latitude))) {
        ctx.addIssue({ code: 'custom', path: ['latitude'], message: 'Enter a latitude' })
      }
      if (d.mode === 'coordinates' && (d.longitude === undefined || Number.isNaN(d.longitude))) {
        ctx.addIssue({ code: 'custom', path: ['longitude'], message: 'Enter a longitude' })
      }
    })
    .transform((d) =>
      d.mode === 'url'
        ? { url: d.url, label: d.label }
        : { latitude: d.latitude, longitude: d.longitude, label: d.label },
    ),
  wifi: z
    .object({
      ssid: z.string().min(1, 'Enter the network name').max(32, 'Network names are at most 32 characters'),
      encryption: z.enum(['WPA', 'WEP', 'nopass']),
      password: z.string().max(63, 'Wi-Fi passwords are at most 63 characters').optional(),
      hidden: z.boolean().optional(),
    })
    .superRefine((d, ctx) => {
      if (d.encryption !== 'nopass' && !d.password) {
        ctx.addIssue({ code: 'custom', path: ['password'], message: 'Enter the network password' })
      }
      if (d.encryption === 'WPA' && d.password && d.password.length < 8) {
        ctx.addIssue({ code: 'custom', path: ['password'], message: 'WPA passwords have at least 8 characters' })
      }
    })
    .transform((d) => (d.encryption === 'nopass' ? { ...d, password: undefined } : d)),
  contact_card: z.object({
    full_name: z.string().trim().min(1, 'Enter a name').max(120),
    title: opt(120),
    organization: opt(160),
    phone: z
      .string()
      .trim()
      .optional()
      .transform((v) => v || undefined)
      .pipe(phone.optional()),
    email: z
      .string()
      .trim()
      .optional()
      .transform((v) => v || undefined)
      .pipe(email.optional()),
    website: z
      .string()
      .trim()
      .optional()
      .transform((v) => v || undefined)
      .pipe(httpUrl.optional()),
    address: opt(300),
    note: opt(300),
  }),
}

export function parseDestination(type: QrType, raw: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; errors: Record<string, string> } {
  const result = destinationSchemas[type].safeParse(raw)
  if (result.success) {
    const value = Object.fromEntries(Object.entries(result.data as Record<string, unknown>).filter(([, v]) => v !== undefined && v !== ''))
    return { ok: true, value }
  }
  const errors: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_'
    errors[key] ??= issue.message
  }
  return { ok: false, errors }
}

export const qrMetaSchema = z.object({
  name: z.string().trim().min(1, 'Name this QR code').max(120, 'Use 120 characters or fewer'),
  description: z
    .string()
    .trim()
    .max(1000)
    .transform((v) => (v === '' ? null : v)),
  business_id: z.string().uuid('Choose a business'),
})
