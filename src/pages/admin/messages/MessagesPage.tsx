import { Archive, Mail, MailOpen, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge, Card, PageHeader, Pagination } from '@/components/ui/data'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/feedback'
import { Select } from '@/components/ui/form'
import { ConfirmDialog } from '@/components/ui/overlay'
import { deleteMessage, listMessages, setMessageStatus } from '@/lib/admin-api'
import { friendlyError } from '@/lib/supabase'
import type { ContactSubmission } from '@/lib/types'
import { useQuery } from '@/lib/use-query'
import { formatDateTime } from '@/lib/utils'

const PAGE_SIZE = 20

export default function MessagesPage() {
  const [status, setStatus] = useState<ContactSubmission['status'] | 'all'>('new')
  const [page, setPage] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<ContactSubmission | null>(null)
  const list = useQuery(() => listMessages(status, page, PAGE_SIZE), [status, page])

  async function mark(m: ContactSubmission, next: ContactSubmission['status']) {
    try {
      await setMessageStatus(m.id, next)
      list.reload()
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <>
      <PageHeader
        title="Messages"
        description="Enquiries sent through the contact form on the public website."
        actions={
          <Select aria-label="Show" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(0) }} className="w-auto">
            <option value="new">New</option>
            <option value="read">Read</option>
            <option value="archived">Archived</option>
            <option value="all">All messages</option>
          </Select>
        }
      />
      <Card>
        {list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : list.loading && !list.data ? (
          <TableSkeleton cols={3} />
        ) : !list.data?.rows.length ? (
          <EmptyState icon={<Mail />} title={status === 'new' ? 'No new messages' : 'No messages here'} description="New enquiries from the website appear here." />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {list.data.rows.map((m) => {
                const open = openId === m.id
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => {
                        setOpenId(open ? null : m.id)
                        if (!open && m.status === 'new') void mark(m, 'read')
                      }}
                      className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left hover:bg-surface/60"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className={m.status === 'new' ? 'font-semibold' : 'font-medium'}>{m.name}</span>
                          {m.company && <span className="truncate text-sm text-muted">{m.company}</span>}
                          {m.status === 'new' && <Badge tone="info">New</Badge>}
                        </span>
                        <span className="mt-0.5 block truncate text-sm text-muted">{m.message}</span>
                      </span>
                      <time className="shrink-0 text-xs text-muted" dateTime={m.created_at}>
                        {formatDateTime(m.created_at)}
                      </time>
                    </button>
                    {open && (
                      <div className="border-t border-line bg-surface/50 px-5 py-4">
                        <dl className="grid gap-1 text-sm sm:grid-cols-[6rem_1fr]">
                          <dt className="text-muted">Email</dt>
                          <dd>
                            <a className="text-signal hover:underline" href={`mailto:${m.email}`}>
                              {m.email}
                            </a>
                          </dd>
                          {m.phone && (
                            <>
                              <dt className="text-muted">Phone</dt>
                              <dd>
                                <a className="text-signal hover:underline" href={`tel:${m.phone.replace(/[^\d+]/g, '')}`}>
                                  {m.phone}
                                </a>
                              </dd>
                            </>
                          )}
                        </dl>
                        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">{m.message}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button asChild size="sm">
                            <a href={`mailto:${m.email}?subject=${encodeURIComponent('Re: your enquiry to 1 Tap Solution')}`}>
                              <Mail /> Reply by email
                            </a>
                          </Button>
                          {m.status !== 'new' && (
                            <Button size="sm" variant="secondary" onClick={() => void mark(m, 'new')}>
                              <MailOpen /> Mark as new
                            </Button>
                          )}
                          {m.status !== 'archived' && (
                            <Button size="sm" variant="secondary" onClick={() => void mark(m, 'archived')}>
                              <Archive /> Archive
                            </Button>
                          )}
                          <Button size="sm" variant="danger-outline" onClick={() => setDeleting(m)}>
                            <Trash2 /> Delete
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={setPage} />
          </>
        )}
      </Card>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(v) => !v && setDeleting(null)}
        destructive
        title="Delete this message?"
        description={<p>The message from {deleting?.name} is removed permanently.</p>}
        confirmLabel="Delete message"
        onConfirm={async () => {
          if (!deleting) return
          try {
            await deleteMessage(deleting.id)
            toast.success('Message deleted')
            setDeleting(null)
            list.reload()
          } catch (e) {
            toast.error(friendlyError(e))
          }
        }}
      />
    </>
  )
}
