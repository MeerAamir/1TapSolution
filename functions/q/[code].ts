/**
 * GET /q/:code — the permanent URL encoded in every dynamic QR code.
 * Resolves the code, records one scan server-side, then either redirects
 * (website, WhatsApp, maps, social, direct documents) or serves the app shell
 * with the page data embedded.
 */
import { handleQrRequest, type EdgeEnv } from '../../src/lib/edge/handlers'

interface Env extends EdgeEnv {
  ASSETS: Fetcher
}

export const onRequestGet: PagesFunction<Env, 'code'> = async (context) => {
  const code = String(context.params.code ?? '')
  // Fetch "/" rather than "/index.html": Pages answers /index.html with a
  // redirect to "/" (pretty URLs), which would leave us with an empty body.
  const loadIndexHtml = async () => {
    const res = await context.env.ASSETS.fetch(new URL('/', context.request.url))
    return res.text()
  }
  return handleQrRequest(context.request, code, context.env, loadIndexHtml)
}

export const onRequestHead = onRequestGet
