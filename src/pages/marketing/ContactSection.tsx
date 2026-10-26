import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Mail, MessageCircle, Phone } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/feedback'
import { Field, Input, Textarea } from '@/components/ui/form'
import { config } from '@/config'
import { whatsappLink } from '@/lib/qr/destinations'
import { contactSchema, type ContactInput } from '@/lib/validation/contact'
import { SectionHeading } from './sections'

export function ContactSection() {
  const [startedAt] = useState(() => Date.now())
  const [status, setStatus] = useState<'idle' | 'sent'>('idle')
  const [serverError, setServerError] = useState<string | null>(null)
  const form = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: '', email: '', phone: '', company: '', message: '' },
  })
  const { errors, isSubmitting } = form.formState
  const { email, phone, whatsapp } = config.contact

  async function onSubmit(values: ContactInput) {
    setServerError(null)
    const honeypot = (document.getElementById('contact-website') as HTMLInputElement | null)?.value ?? ''
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, website: honeypot, startedAt }),
      })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !body.ok) {
        setServerError(body.error ?? 'Your message could not be sent. Try again in a few minutes.')
        return
      }
      setStatus('sent')
      form.reset()
    } catch {
      setServerError('Could not reach the server. Check your connection and try again.')
    }
  }

  return (
    <section className="bg-surface py-20 sm:py-28" aria-labelledby="contact">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <SectionHeading
            id="contact"
            title="Get started"
            intro="Tell us about your business and what you would like your QR codes to do. We will reply with a setup plan."
          />
          {(email || phone || whatsapp) && (
            <ul className="mt-8 grid gap-3 text-[0.97rem]">
              {email && (
                <li>
                  <a href={`mailto:${email}`} className="inline-flex items-center gap-3 font-medium hover:text-signal">
                    <Mail className="size-5 text-signal" /> {email}
                  </a>
                </li>
              )}
              {phone && (
                <li>
                  <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-3 font-medium hover:text-signal">
                    <Phone className="size-5 text-signal" /> {phone}
                  </a>
                </li>
              )}
              {whatsapp && (
                <li>
                  <a href={whatsappLink(whatsapp)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3 font-medium hover:text-signal">
                    <MessageCircle className="size-5 text-signal" /> WhatsApp us
                  </a>
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-line bg-white p-6 sm:p-8">
          {status === 'sent' ? (
            <div className="flex flex-col items-start py-6" role="status">
              <CheckCircle2 className="size-9 text-success" />
              <h3 className="mt-4 text-xl font-semibold">Message sent</h3>
              <p className="mt-2 text-ink/70">Thanks for getting in touch. We will reply to the email address you gave us.</p>
              <Button variant="secondary" className="mt-6" onClick={() => setStatus('idle')}>
                Send another message
              </Button>
            </div>
          ) : (
            <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Name" required error={errors.name?.message}>
                  {(p) => <Input {...p} autoComplete="name" {...form.register('name')} />}
                </Field>
                <Field label="Email" required error={errors.email?.message}>
                  {(p) => <Input {...p} type="email" autoComplete="email" {...form.register('email')} />}
                </Field>
                <Field label="Phone" error={errors.phone?.message}>
                  {(p) => <Input {...p} type="tel" autoComplete="tel" {...form.register('phone')} />}
                </Field>
                <Field label="Business name" error={errors.company?.message}>
                  {(p) => <Input {...p} autoComplete="organization" {...form.register('company')} />}
                </Field>
              </div>
              <Field label="How can we help?" required error={errors.message?.message}>
                {(p) => <Textarea {...p} rows={5} {...form.register('message')} />}
              </Field>
              {/* Honeypot: hidden from people and assistive tech, often filled by bots. */}
              <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden>
                <label htmlFor="contact-website">Website</label>
                <input id="contact-website" name="website" tabIndex={-1} autoComplete="off" />
              </div>
              {serverError && <Notice tone="danger">{serverError}</Notice>}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted">
                  We use your details only to reply. See our{' '}
                  <a href="/privacy" className="underline underline-offset-2">
                    privacy policy
                  </a>
                  .
                </p>
                <Button type="submit" size="lg" loading={isSubmitting}>
                  Send message
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}
