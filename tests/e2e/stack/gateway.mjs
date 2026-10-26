// Local stand-in for the Supabase API gateway, for end-to-end tests only.
//   /rest/v1/*    -> PostgREST
//   /auth/v1/*    -> Supabase Auth (GoTrue)
//   /storage/v1/* -> a tiny in-memory object store (enough for uploads,
//                    public reads and deletes; storage RLS is covered by the
//                    database integration tests)
import http from 'node:http'

const PORT = Number(process.env.GATEWAY_PORT ?? 54400)
const REST = process.env.REST_URL ?? 'http://127.0.0.1:3000'
const AUTH = process.env.AUTH_URL ?? 'http://127.0.0.1:9999'
const objects = new Map() // "bucket/path" -> { type, body }

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD')
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Location')
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks)
}

function extractMultipartFile(body, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType ?? '')
  if (!m) return { body, type: contentType }
  const boundary = Buffer.from(`--${m[1] ?? m[2]}`)
  let start = 0
  while ((start = body.indexOf(boundary, start)) !== -1) {
    const headerEnd = body.indexOf('\r\n\r\n', start)
    if (headerEnd === -1) break
    const headers = body.subarray(start, headerEnd).toString()
    const next = body.indexOf(boundary, headerEnd)
    if (/filename=/i.test(headers) || /name=""/.test(headers)) {
      const type = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]
      return { body: body.subarray(headerEnd + 4, next - 2), type }
    }
    start = next
  }
  return { body, type: contentType }
}

async function proxy(req, res, target, stripPrefix) {
  const url = new URL(req.url, 'http://x')
  const dest = target + url.pathname.slice(stripPrefix.length) + url.search
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req)
  const headers = { ...req.headers }
  delete headers.host
  delete headers['content-length']
  const upstream = await fetch(dest, { method: req.method, headers, body, redirect: 'manual' })
  cors(res)
  res.statusCode = upstream.status
  upstream.headers.forEach((v, k) => {
    if (!['content-encoding', 'transfer-encoding', 'connection', 'access-control-allow-origin'].includes(k)) res.setHeader(k, v)
  })
  res.end(Buffer.from(await upstream.arrayBuffer()))
}

async function storage(req, res) {
  cors(res)
  const url = new URL(req.url, 'http://x')
  const path = decodeURIComponent(url.pathname.replace(/^\/storage\/v1/, ''))
  let m
  if (req.method === 'GET' && (m = /^\/object\/public\/([^/]+)\/(.+)$/.exec(path))) {
    const obj = objects.get(`${m[1]}/${m[2]}`)
    if (!obj || m[1] !== 'public-files') return json(res, 404, { error: 'not_found' })
    res.setHeader('Content-Type', obj.type ?? 'application/octet-stream')
    if (url.searchParams.has('download')) res.setHeader('Content-Disposition', 'attachment')
    return res.end(obj.body)
  }
  if (!req.headers.authorization) return json(res, 401, { error: 'unauthorized' })
  if (req.method === 'POST' && (m = /^\/object\/sign\/([^/]+)\/(.+)$/.exec(path))) {
    return json(res, 200, { signedURL: `/object/public/${m[1]}/${m[2]}?token=e2e` })
  }
  if ((req.method === 'POST' || req.method === 'PUT') && (m = /^\/object\/([^/]+)\/(.+)$/.exec(path))) {
    const raw = await readBody(req)
    const file = extractMultipartFile(raw, req.headers['content-type'])
    objects.set(`${m[1]}/${m[2]}`, file)
    return json(res, 200, { Key: `${m[1]}/${m[2]}`, Id: crypto.randomUUID() })
  }
  if (req.method === 'DELETE' && (m = /^\/object\/([^/]+)$/.exec(path))) {
    const { prefixes = [] } = JSON.parse((await readBody(req)).toString() || '{}')
    prefixes.forEach((p) => objects.delete(`${m[1]}/${p}`))
    return json(res, 200, prefixes.map((name) => ({ name })))
  }
  return json(res, 404, { error: 'not_found' })
}

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

http
  .createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        cors(res)
        res.statusCode = 204
        return res.end()
      }
      if (req.url.startsWith('/rest/v1')) return await proxy(req, res, REST, '/rest/v1')
      if (req.url.startsWith('/auth/v1')) return await proxy(req, res, AUTH, '/auth/v1')
      if (req.url.startsWith('/storage/v1')) return await storage(req, res)
      json(res, 404, { error: 'unknown route' })
    } catch (e) {
      json(res, 502, { error: String(e) })
    }
  })
  .listen(PORT, '127.0.0.1', () => console.log(`gateway on ${PORT}`))
