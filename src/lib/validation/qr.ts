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

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a colour')
const uuid = z.string().uuid()

/** Mirrors public.is_valid_theme(). */
export const themeSchema = z
  .object({
    font: z.enum(['inter', 'poppins', 'montserrat', 'playfair', 'lora', 'nunito', 'merriweather', 'oswald', 'dancing', 'roboto-slab']).optional(),
    accent: hex.optional(),
    title_color: hex.optional(),
    text_color: hex.optional(),
    bg_type: z.enum(['soft', 'solid', 'gradient', 'image']).optional(),
    bg_color: hex.optional(),
    bg_color2: hex.optional(),
    bg_angle: z.number().min(0).max(360).optional(),
    bg_image_file_id: uuid.optional(),
    bg_overlay: z.number().min(0).max(0.9).optional(),
    button_style: z.enum(['solid', 'outline', 'soft']).optional(),
    button_shape: z.enum(['rounded', 'pill', 'square']).optional(),
    button_color: hex.optional(),
    button_text_color: hex.optional(),
  })
  .optional()

const blankToUndef = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)

/** Mirrors public.is_valid_payment(). */
export const paymentSchema = z
  .object({
    upi_id: z.preprocess(
      blankToUndef,
      z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9._-]{2,200}@[A-Za-z][A-Za-z0-9]{1,63}$/, 'Enter a UPI ID like yourname@okicici')
        .optional(),
    ),
    payee_name: opt(100),
    amount: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
      z.number({ message: 'Enter an amount' }).positive('Enter an amount above 0').max(1000000, 'Up to ₹10,00,000').optional(),
    ),
    note: opt(80),
    label: opt(80),
    direct: z.boolean().optional(),
    links: z
      .array(z.object({ label: z.string().trim().min(1, 'Name the link').max(60), url: httpUrl }))
      .max(6)
      .optional()
      .transform((v) => (v && v.length ? v : undefined)),
    bank: z
      .object({
        account_name: opt(100),
        bank_name: opt(100),
        account_number: z.preprocess(blankToUndef, z.string().trim().regex(/^[0-9]{6,34}$/, 'Digits only').optional()),
        ifsc: z.preprocess(blankToUndef, z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'IFSC looks like SBIN0001234').optional()),
      })
      .optional()
      .transform((b) => (b && Object.values(b).some(Boolean) ? b : undefined)),
    theme: themeSchema,
  })
  .superRefine((d, ctx) => {
    if (!d.upi_id && !d.links?.length && !d.bank?.account_number) {
      ctx.addIssue({ code: 'custom', path: ['upi_id'], message: 'Add a UPI ID, a payment link or bank details' })
    }
  })

/** Mirrors public.is_valid_review(). */
export const reviewSchema = z
  .object({
    url: z.preprocess(blankToUndef, httpUrl.optional()),
    place_id: z.preprocess(blankToUndef, z.string().trim().regex(/^[A-Za-z0-9_-]{10,200}$/, 'A Place ID looks like ChIJN1t_tDeuEmsRUsoyG83frY4').optional()),
    label: opt(80),
    title: opt(120),
  })
  .superRefine((d, ctx) => {
    if (!d.url && !d.place_id) ctx.addIssue({ code: 'custom', path: ['url'], message: 'Paste your Google review link' })
  })

const menuItem = z.object({
  name: z.string().trim().min(1, 'Name the dish or item').max(120),
  price: opt(30),
  description: opt(300),
  tag: z.preprocess(blankToUndef, z.enum(['veg', 'non_veg', 'vegan', 'spicy', 'new', 'popular']).optional()),
})

/** Mirrors public.is_valid_menu(). */
export const menuSchema = z
  .object({
    mode: z.enum(['items', 'pdf', 'images', 'link']),
    title: opt(120),
    note: opt(300),
    currency: opt(8),
    label: opt(80),
    sections: z
      .array(
        z.object({
          name: opt(80),
          // Empty rows (nothing typed yet) are ignored rather than blocking the save.
          items: z.preprocess(
            (v) =>
              Array.isArray(v)
                ? v.filter((it) => it && typeof it === 'object' && Object.values(it as Record<string, unknown>).some((x) => typeof x === 'string' && x.trim() !== ''))
                : v,
            z.array(menuItem).max(150),
          ),
        }),
      )
      .max(40)
      .optional(),
    file_id: uuid.optional(),
    file_ids: z.array(uuid).max(30).optional(),
    url: z.preprocess(blankToUndef, httpUrl.optional()),
    theme: themeSchema,
  })
  .superRefine((d, ctx) => {
    if (d.mode === 'items' && !d.sections?.some((s) => s.items.length)) ctx.addIssue({ code: 'custom', path: ['sections'], message: 'Add at least one item' })
    if (d.mode === 'pdf' && !d.file_id) ctx.addIssue({ code: 'custom', path: ['file_id'], message: 'Upload the menu PDF' })
    if (d.mode === 'images' && !d.file_ids?.length) ctx.addIssue({ code: 'custom', path: ['file_ids'], message: 'Add photos of the menu' })
    if (d.mode === 'link' && !d.url) ctx.addIssue({ code: 'custom', path: ['url'], message: 'Paste the menu link' })
  })
  .transform((d) => {
    // Keep only what the chosen kind of menu needs.
    const base = { mode: d.mode, title: d.title, note: d.note, label: d.label, theme: d.theme }
    if (d.mode === 'items')
      return { ...base, currency: d.currency, sections: d.sections!.filter((s) => s.items.length).map((s) => (s.name ? s : { items: s.items })) }
    if (d.mode === 'pdf') return { ...base, file_id: d.file_id }
    if (d.mode === 'images') return { ...base, file_ids: d.file_ids }
    return { ...base, url: d.url }
  })

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
    theme: themeSchema,
  }),
  text: z.object({
    title: opt(160),
    text: z.string().trim().min(1, 'Type the text to show').max(4000, 'Use 4,000 characters or fewer'),
    theme: themeSchema,
  }),
  menu: menuSchema,
  payment: paymentSchema,
  review: reviewSchema,
  document: z.object({ open_mode: z.enum(['page', 'direct']).default('page'), theme: themeSchema }),
  website: z.object({ url: httpUrl }),
  custom_link: z.object({ url: httpUrl }),
  social: z.object({ platform: z.enum([...SOCIAL_PLATFORMS]), url: httpUrl }),
  phone: z.object({ phone, label: opt(80), theme: themeSchema }),
  whatsapp: z.object({ phone, message: opt(500) }),
  email: z.object({ email, subject: opt(200), body: opt(1000), theme: themeSchema }),
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
    theme: themeSchema,
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
