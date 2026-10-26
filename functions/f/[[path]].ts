/**
 * GET /f/<path> — cached delivery of public files (optional, see src/lib/edge/files.ts).
 * Only active when FILE_PROXY=on; otherwise pages link to Supabase directly.
 */
import { handleFileRequest } from '../../src/lib/edge/files'
import type { EdgeEnv } from '../../src/lib/edge/handlers'

interface Env extends EdgeEnv {
  FILE_PROXY?: string
}

export const onRequestGet: PagesFunction<Env, 'path'> = async (context) => {
  if (context.env.FILE_PROXY !== 'on') return new Response('Not found', { status: 404 })
  const parts = context.params.path
  const path = Array.isArray(parts) ? parts.join('/') : String(parts ?? '')
  let cache: Cache | null = null
  try {
    cache = caches.default
  } catch {
    cache = null
  }
  return handleFileRequest(context.request, path, context.env, cache, (p) => context.waitUntil(p))
}
