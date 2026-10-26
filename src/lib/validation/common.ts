import { z } from 'zod'
import { isSafeHttpUrl } from '@/lib/qr/destinations'

/** Empty string → null so optional DB columns stay NULL. */
export const optionalText = (max: number, message?: string) =>
  z
    .string()
    .trim()
    .max(max, message ?? `Use ${max} characters or fewer`)
    .transform((v) => (v === '' ? null : v))

export const httpUrl = z
  .string()
  .trim()
  .refine((v) => isSafeHttpUrl(v), 'Enter a full web address starting with https://')

export const optionalHttpUrl = z
  .string()
  .trim()
  .refine((v) => v === '' || isSafeHttpUrl(v), 'Enter a full web address starting with https://')
  .transform((v) => (v === '' ? null : v))

const phoneOk = (v: string) => /^\+?[0-9 ().-]{6,24}$/.test(v) && v.replace(/\D/g, '').length >= 6 && v.replace(/\D/g, '').length <= 15

export const phone = z.string().trim().refine(phoneOk, 'Enter a phone number with country code, e.g. +91 98765 43210')

export const optionalPhone = z
  .string()
  .trim()
  .refine((v) => v === '' || phoneOk(v), 'Enter a phone number with country code, e.g. +91 98765 43210')
  .transform((v) => (v === '' ? null : v))

export const email = z.string().trim().email('Enter a valid email address').max(254)

export const optionalEmail = z
  .string()
  .trim()
  .refine((v) => v === '' || z.string().email().safeParse(v).success, 'Enter a valid email address')
  .transform((v) => (v === '' ? null : v.toLowerCase()))

export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #2563EB')

export const slug = z
  .string()
  .trim()
  .min(2, 'Use at least 2 characters')
  .max(80, 'Use 80 characters or fewer')
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens')
