import { z } from 'zod'
import { SOCIAL_PLATFORMS } from '@/lib/qr/types'
import { hexColor, httpUrl, optionalEmail, optionalHttpUrl, optionalPhone, optionalText, slug } from './common'

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM')

export const businessFormSchema = z.object({
  name: z.string().trim().min(1, 'Enter the business name').max(120, 'Use 120 characters or fewer'),
  slug,
  category_id: z.string().uuid().nullable().or(z.literal('').transform(() => null)),
  tagline: optionalText(160),
  description: optionalText(4000),
  phone: optionalPhone,
  whatsapp: optionalPhone,
  email: optionalEmail,
  website_url: optionalHttpUrl,
  google_business_url: optionalHttpUrl,
  accent_color: hexColor,
  hours_note: optionalText(200),
  status: z.enum(['active', 'inactive']),
  logo_file_id: z.string().uuid().nullable(),
  cover_file_id: z.string().uuid().nullable(),
  custom_fields: z
    .array(
      z.object({
        label: z.string().trim().min(1, 'Add a label').max(60),
        value: z.string().trim().min(1, 'Add a value').max(500),
      }),
    )
    .max(20),
  hours: z
    .array(
      z
        .object({ day_of_week: z.number().int().min(0).max(6), opens_at: time, closes_at: time })
        .refine((h) => h.opens_at !== h.closes_at, { message: 'Opening and closing time are the same', path: ['closes_at'] }),
    )
    .max(28),
  locations: z
    .array(
      z
        .object({
          label: z.string().trim().min(1, 'Name this location').max(80),
          address: optionalText(400),
          latitude: z.union([z.number().min(-90).max(90), z.nan().transform(() => null), z.null()]),
          longitude: z.union([z.number().min(-180).max(180), z.nan().transform(() => null), z.null()]),
          maps_url: optionalHttpUrl,
        })
        .refine((l) => (l.latitude === null) === (l.longitude === null), {
          message: 'Enter both latitude and longitude, or neither',
          path: ['longitude'],
        }),
    )
    .max(20),
  social_links: z
    .array(
      z.object({
        platform: z.enum([...SOCIAL_PLATFORMS]),
        label: optionalText(60),
        url: httpUrl,
      }),
    )
    .max(20),
})

export type BusinessFormInput = z.input<typeof businessFormSchema>
export type BusinessFormValues = z.output<typeof businessFormSchema>
