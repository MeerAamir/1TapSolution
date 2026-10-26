#!/usr/bin/env node
/**
 * Uploads demonstration PDFs (a café menu and a school brochure) and creates the
 * two demo document QR codes that point to them.
 *
 * Run ONCE from your own computer after the SQL seed:
 *   SUPABASE_URL=https://<project>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service role key> \
 *   npm run seed:files
 *
 * Use the secret key (sb_secret_…) or the legacy service_role key.
 * It bypasses security rules: keep it in your terminal only.
 * Never put it in .env files that are committed, in Cloudflare, or in the browser.
 */
import { jsPDF } from 'jspdf'

const url = process.env.SUPABASE_URL?.replace(/\/+$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see the comment at the top of this file).')
  process.exit(1)
}
// New secret keys (sb_secret_…) go in `apikey` only; legacy JWT keys also as Bearer.
const headers = key.startsWith('eyJ') ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key }

async function rest(path, init = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers ?? {}) },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${path}: ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

function menuPdf() {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' })
  doc.setFillColor(180, 83, 9)
  doc.rect(0, 0, 148, 28, 'F')
  doc.setTextColor(255, 255, 255).setFont('helvetica', 'bold').setFontSize(18)
  doc.text('Chinar Leaf Café', 12, 15)
  doc.setFont('helvetica', 'normal').setFontSize(9).text('DEMONSTRATION MENU · sample content', 12, 22)
  const sections = [
    ['Hot drinks', [['Saffron kahwa (pot for two)', '180'], ['Single-origin pour-over', '220'], ['Masala chai', '90']]],
    ['Bakes', [['Walnut brownie', '220'], ['Seasonal fruit tart', '260'], ['Almond croissant', '160']]],
    ['All-day breakfast', [['Garden breakfast plate', '340'], ['Shakshuka with sourdough', '310']]],
  ]
  let y = 42
  doc.setTextColor(15, 23, 42)
  for (const [title, items] of sections) {
    doc.setFont('helvetica', 'bold').setFontSize(12).text(title, 12, y)
    y += 7
    doc.setFont('helvetica', 'normal').setFontSize(10)
    for (const [name, price] of items) {
      doc.text(name, 12, y)
      doc.text(`Rs ${price}`, 136, y, { align: 'right' })
      y += 6
    }
    y += 5
  }
  doc.setFontSize(8).setTextColor(100, 116, 139).text('This menu is example content for the 1 Tap Solution demo.', 12, 200)
  return Buffer.from(doc.output('arraybuffer'))
}

function brochurePdf() {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.setFillColor(67, 56, 202)
  doc.rect(0, 0, 210, 40, 'F')
  doc.setTextColor(255, 255, 255).setFont('helvetica', 'bold').setFontSize(24).text('Northstar Academy', 16, 22)
  doc.setFont('helvetica', 'normal').setFontSize(11).text('Admissions brochure · demonstration content', 16, 31)
  doc.setTextColor(15, 23, 42).setFontSize(12)
  const lines = [
    'Streams: Science, Commerce and Humanities.',
    'Facilities: laboratories, library, sports ground, transport and hostel.',
    'Admission steps: 1. Visit the campus  2. Submit the form  3. Interaction  4. Confirmation.',
    'Documents: previous mark sheets, transfer certificate, two photographs.',
  ]
  lines.forEach((l, i) => doc.text(l, 16, 58 + i * 10, { maxWidth: 178 }))
  doc.setFontSize(9).setTextColor(100, 116, 139).text('This brochure is example content for the 1 Tap Solution demo.', 16, 280)
  return Buffer.from(doc.output('arraybuffer'))
}

async function upload(businessSlug, title, filename, buffer, qr) {
  const [biz] = await rest(`businesses?slug=eq.${businessSlug}&select=id`)
  if (!biz) throw new Error(`Run supabase/seed.sql first: business ${businessSlug} not found`)
  const existing = await rest(`qr_codes?public_code=eq.${qr.code}&select=id`)
  if (existing.length) {
    console.log(`✓ ${qr.code} already exists, skipping`)
    return
  }
  const path = `${biz.id}/${crypto.randomUUID()}.pdf`
  const up = await fetch(`${url}/storage/v1/object/public-files/${path}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/pdf', 'x-upsert': 'false' },
    body: buffer,
  })
  if (!up.ok) throw new Error(`upload failed: ${up.status} ${await up.text()}`)
  const [file] = await rest('files', {
    method: 'POST',
    body: JSON.stringify({
      business_id: biz.id,
      bucket: 'public-files',
      storage_path: path,
      title,
      original_filename: filename,
      mime_type: 'application/pdf',
      size_bytes: buffer.length,
      show_on_profile: true,
    }),
  })
  await rest('qr_codes', {
    method: 'POST',
    body: JSON.stringify({
      public_code: qr.code,
      business_id: biz.id,
      name: qr.name,
      description: 'Demonstration document QR code',
      type: 'document',
      destination: { open_mode: 'page' },
      file_id: file.id,
      design: qr.design,
      is_demo: true,
    }),
  })
  console.log(`✓ ${qr.code} → ${title}`)
}

await upload('demo-chinar-leaf-cafe', 'Menu', 'chinar-leaf-menu.pdf', menuPdf(), {
  code: 'demoMenu01',
  name: 'Chinar Leaf Café — Menu PDF',
  design: { fg: '#1C1917', bg: '#FFFFFF', dots: 'rounded', eyes: 'rounded', frame: true, cta: 'Scan for menu', ecl: 'Q' },
})
await upload('demo-northstar-academy', 'Admissions brochure', 'northstar-brochure.pdf', brochurePdf(), {
  code: 'demoBrochure',
  name: 'Northstar Academy — Admission brochure',
  design: { fg: '#312E81', bg: '#FFFFFF', ecl: 'M' },
})
console.log('Demo files ready.')
