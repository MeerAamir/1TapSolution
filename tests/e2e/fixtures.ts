import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, type Page } from '@playwright/test'
import pg from 'pg'

export interface Stack {
  SITE: string
  GATEWAY: string
  DB_URL: string
  ANON_KEY: string
  ADMIN: { email: string; password: string }
  OTHER: { email: string; password: string }
}

export const stack: Stack = JSON.parse(readFileSync(fileURLToPath(new URL('./.stack.json', import.meta.url)), 'utf8')) as Stack

export async function db<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: stack.DB_URL })
  await c.connect()
  try {
    return (await c.query<T>(text, params)).rows
  } finally {
    await c.end()
  }
}

export async function login(page: Page, who: { email: string; password: string } = stack.ADMIN) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(who.email)
  await page.getByLabel('Password').fill(who.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

export async function loginAsAdmin(page: Page) {
  await login(page)
  await expect(page.getByRole('heading', { name: 'My QR codes' })).toBeVisible()
}

/** A tiny but valid one-page PDF containing the given text. */
export function makePdf(text: string): Buffer {
  const content = `BT /F1 24 Tf 72 720 Td (${text.replace(/[()\\]/g, '')}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((o, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

export const uid = () => Math.random().toString(36).slice(2, 8)
