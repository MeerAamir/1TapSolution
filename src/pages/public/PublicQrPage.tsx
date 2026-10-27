import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { QrDestinationView, StatusScreen } from '@/components/public/QrDestinationView'
import { isSupabaseConfigured } from '@/config'
import { fetchPublicQr, takeEmbeddedQrPayload } from '@/lib/public-api'
import type { PublicQrPayload } from '@/lib/types'
import { usePageMeta } from './usePageMeta'

/**
 * /q/<code>. In production the edge function has already recorded the scan
 * and embedded the data in the HTML. This page never records scans itself, so
 * one visit is counted once.
 */
export default function PublicQrPage() {
  const { code = '' } = useParams()
  const [payload, setPayload] = useState<PublicQrPayload | null>(() => takeEmbeddedQrPayload(code))
  const [error, setError] = useState(false)

  useEffect(() => {
    if (payload || !isSupabaseConfigured) return
    const controller = new AbortController()
    fetchPublicQr(code, controller.signal)
      .then(setPayload)
      .catch((e: unknown) => {
        if ((e as Error).name !== 'AbortError') setError(true)
      })
    return () => controller.abort()
  }, [code, payload])

  const d = (payload?.destination ?? {}) as Record<string, unknown>
  const pageTitle = payload?.business?.name || (typeof d.title === 'string' && d.title) || (typeof d.full_name === 'string' && d.full_name) || undefined
  usePageMeta(pageTitle, (typeof d.accent === 'string' && d.accent) || payload?.business?.accent_color)

  if (!isSupabaseConfigured) {
    return <StatusScreen title="Not connected" message="This site is not connected to its database yet." />
  }
  if (error) {
    return (
      <StatusScreen
        title="We could not load this page"
        message="Check your internet connection and try again."
      >
        <button
          type="button"
          onClick={() => {
            setError(false)
            setPayload(null)
          }}
          className="mt-5 h-11 rounded-xl bg-midnight px-5 text-sm font-semibold text-white"
        >
          Try again
        </button>
      </StatusScreen>
    )
  }
  if (!payload) return <LoadingScreen />
  return <QrDestinationView payload={payload} />
}

export function LoadingScreen() {
  return (
    <div className="min-h-dvh bg-surface" role="status" aria-label="Loading">
      <div className="mx-auto max-w-xl animate-pulse">
        <div className="h-28 bg-line/60" />
        <div className="px-5">
          <div className="-mt-10 h-20 w-20 rounded-2xl bg-line ring-4 ring-surface" />
          <div className="mt-4 h-7 w-2/3 rounded bg-line" />
          <div className="mt-2 h-4 w-1/2 rounded bg-line/70" />
          <div className="mt-6 grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[4.5rem] rounded-xl bg-line/60" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
