import { zodResolver } from '@hookform/resolvers/zod'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { useAuth } from '@/auth/AuthProvider'
import { ActivityList } from '@/components/admin/ActivityList'
import { UsagePanel } from '@/components/admin/UsagePanel'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, PageHeader } from '@/components/ui/data'
import { Notice } from '@/components/ui/feedback'
import { ConfirmDialog } from '@/components/ui/overlay'
import { Field, Input } from '@/components/ui/form'
import { config } from '@/config'
import { demoContentCounts, recentActivity, removeDemoContent } from '@/lib/admin-api'
import { friendlyError, getSupabase } from '@/lib/supabase'
import { useQuery } from '@/lib/use-query'
import { formatDate } from '@/lib/utils'

const passwordSchema = z
  .object({
    password: z.string().min(12, 'Use at least 12 characters').max(72, 'Use 72 characters or fewer'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] })

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[14rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0">
        <span className="break-all text-sm font-medium">{value || 'Not set'}</span>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </dd>
    </div>
  )
}

function SampleContentCard() {
  const counts = useQuery(demoContentCounts, [])
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const total = (counts.data?.businesses ?? 0) + (counts.data?.qr ?? 0)
  if (!counts.data || total === 0) return null
  return (
    <Card>
      <CardHeader
        title="Sample content"
        description={`${counts.data.businesses} sample businesses and ${counts.data.qr} sample QR codes came with the installation to show how things work. Their details are made up.`}
      />
      <div className="p-5 pt-0">
        <Button variant="danger-outline" onClick={() => setConfirm(true)}>
          <Trash2 /> Remove all sample content
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        loading={busy}
        destructive
        title="Remove all sample content?"
        description={<p>The sample businesses and their QR codes are deleted. Anything you created yourself stays exactly as it is.</p>}
        confirmLabel="Remove samples"
        onConfirm={async () => {
          setBusy(true)
          try {
            await removeDemoContent()
            toast.success('Sample content removed')
            counts.reload()
          } catch (e) {
            toast.error(friendlyError(e))
          } finally {
            setBusy(false)
            setConfirm(false)
          }
        }}
      />
    </Card>
  )
}

export default function SettingsPage() {
  const { user } = useAuth()
  const activity = useQuery(() => recentActivity(40), [])
  const form = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema), defaultValues: { password: '', confirm: '' } })
  const urlLooksLocal = /localhost|127\.0\.0\.1/.test(config.publicAppUrl)

  return (
    <>
      <PageHeader title="Settings" description="Your account and how this installation is configured." />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="grid gap-6 self-start">
          <UsagePanel />
          <SampleContentCard />
          <Card>
            <CardHeader title="Your account" />
            <dl className="divide-y divide-line px-5">
              <Row label="Email" value={user?.email ?? ''} />
              <Row label="Member since" value={formatDate(user?.created_at)} />
              <Row label="Last sign-in" value={formatDate(user?.last_sign_in_at)} />
            </dl>
          </Card>
          <Card>
            <CardHeader title="Change password" />
            <form
              noValidate
              className="grid gap-4 p-5"
              onSubmit={form.handleSubmit(async ({ password }) => {
                const { error } = await getSupabase().auth.updateUser({ password })
                if (error) toast.error(error.message)
                else {
                  toast.success('Password changed')
                  form.reset()
                }
              })}
            >
              <Field label="New password" hint="At least 12 characters." error={form.formState.errors.password?.message}>
                {(p) => <Input {...p} type="password" autoComplete="new-password" {...form.register('password')} />}
              </Field>
              <Field label="Confirm new password" error={form.formState.errors.confirm?.message}>
                {(p) => <Input {...p} type="password" autoComplete="new-password" {...form.register('confirm')} />}
              </Field>
              <Button type="submit" className="justify-self-start" loading={form.formState.isSubmitting}>
                Change password
              </Button>
            </form>
          </Card>
          <Card>
            <CardHeader title="Installation" description="Set through environment variables when the site is built." />
            <dl className="divide-y divide-line px-5">
              <Row
                label="Public site address"
                value={config.publicAppUrl}
                hint="Every QR code encodes this address. Set it to the final domain before printing codes."
              />
              <Row label="Maximum upload size" value={`${config.maxUploadMb} MB`} hint="Keep in line with the storage bucket limit." />
              <Row label="Analytics time zone" value={config.analyticsTimeZone} />
              <Row label="Contact email (public)" value={config.contact.email} />
              <Row label="Contact phone (public)" value={config.contact.phone} />
            </dl>
            {urlLooksLocal && (
              <div className="px-5 pb-5">
                <Notice tone="warning">The public address points to a local machine. QR codes downloaded now will not work on other phones.</Notice>
              </div>
            )}
          </Card>
          <Notice tone="info">
            Administrators are added by the owner in the Supabase dashboard. See docs/ADMIN_SETUP.md. There is no public sign-up.
          </Notice>
        </div>
        <Card className="self-start">
          <CardHeader title="Audit log" description="Recent changes by all administrators." />
          <ActivityList logs={activity.data ?? []} />
        </Card>
      </div>
    </>
  )
}
