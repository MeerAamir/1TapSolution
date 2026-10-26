import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BusinessProfile } from '@/components/public/BusinessProfile'
import { StatusScreen } from '@/components/public/QrDestinationView'
import { isSupabaseConfigured } from '@/config'
import { fetchPublicBusiness } from '@/lib/public-api'
import type { PublicBusiness } from '@/lib/types'
import { LoadingScreen } from './PublicQrPage'
import { usePageMeta } from './usePageMeta'

/** /b/<slug> — shareable business page link (not counted as a QR scan). */
export default function PublicBusinessRoute() {
  const { slug = '' } = useParams()
  const [state, setState] = useState<'loading' | 'ok' | 'not_found' | 'error'>('loading')
  const [business, setBusiness] = useState<PublicBusiness | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    const controller = new AbortController()
    setState('loading')
    fetchPublicBusiness(slug, controller.signal)
      .then((res) => {
        setBusiness(res.business ?? null)
        setState(res.state === 'ok' ? 'ok' : 'not_found')
      })
      .catch((e: unknown) => {
        if ((e as Error).name !== 'AbortError') setState('error')
      })
    return () => controller.abort()
  }, [slug])

  usePageMeta(business?.name, business?.accent_color)

  if (state === 'not_found') {
    return <StatusScreen title="This page is not available" message="The business page may have been moved or paused." />
  }
  if (state === 'error') {
    return <StatusScreen title="We could not load this page" message="Check your internet connection and refresh." />
  }
  if (!business) return <LoadingScreen />
  return <BusinessProfile business={business} />
}
