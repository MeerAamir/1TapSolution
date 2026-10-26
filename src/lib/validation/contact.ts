import { z } from 'zod'

const phonePattern = /^\+?[0-9 ().-]{6,24}$/

/** Shared by the contact form (browser) and /api/contact (edge). */
export const contactSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(120, 'Use 120 characters or fewer'),
  email: z.string().trim().email('Enter a valid email address').max(254),
  phone: z
    .string()
    .trim()
    .max(24)
    .refine((v) => v === '' || (phonePattern.test(v) && v.replace(/\D/g, '').length >= 6), 'Enter a valid phone number')
    .optional()
    .default(''),
  company: z.string().trim().max(160, 'Use 160 characters or fewer').optional().default(''),
  message: z.string().trim().min(10, 'Write at least 10 characters').max(4000, 'Use 4,000 characters or fewer'),
})

export type ContactInput = z.input<typeof contactSchema>
