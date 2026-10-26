# Security

## Model

- **Authentication**: Supabase Auth with email and password. Public sign-up is disabled, and administrators are created by the owner (see `ADMIN_SETUP.md`). Sessions use Supabase's recommended persisted session with automatic token refresh. The app warns when a session ends unexpectedly.
- **Authorization lives in the database.** `public.is_admin()` checks `admin_users` for the JWT's user id. Every management table has RLS policies that call it. The dashboard route guard is only a convenience: bypassing it exposes nothing.
- **No self-promotion.** `admin_users` has no insert, update or delete policy and no write grant for API roles. Rows are added only from the SQL editor or with the service role.
- **Public visitors** have no table access at all. They can only call `get_public_qr` and `get_public_business`, which return published fields of active records.
- **Edge writes** (scan events, contact messages) go through `SECURITY DEFINER` functions that require a shared ingest secret. Only its SHA-256 hash is stored, in a table with no API access.
- **Service-role key**: not used by the website or the edge functions. Only the optional demo-seeding script uses it, run from the owner's own terminal.
- **Function privileges**: Supabase grants `EXECUTE` on new functions to `anon` by default. The migrations revoke everything, grant back an explicit allow-list, and change default privileges so future functions start private. The test suite checks this. This step caught a real issue during development: the ingest secret could otherwise have been overwritten by anyone.

## Access matrix

| Object | Anonymous visitor | Signed-in non-admin | Administrator | Edge function | Notes |
| --- | --- | --- | --- | --- | --- |
| `businesses`, `qr_codes`, `files`, `content_blocks`, `categories`, locations/hours/links | none | none (RLS: 0 rows) | full CRUD | none | Published data only via `get_public_*` |
| `admin_users` | none | own row (read) | read all | none | No write access for anyone via the API |
| `qr_scan_events` | none | none | read | insert via `edge_resolve_qr` + secret | No IP column exists |
| `contact_submissions` | none | none | read, update, delete | insert via `submit_contact_form` + secret | Rate-limited |
| `audit_logs` | none | none | read | none | Written by triggers only |
| `app_secrets` | none | none | none | none | Hash only |
| `app_heartbeat` | only via `keep_alive()` (bumps one counter, at most once a minute) | same | read via `admin_usage()` | n/a | Keeps the Free project active |
| `qr_scan_daily` | none | none | read | n/a | Daily totals for scans older than 90 days |
| Storage `public-files` | read by exact URL (no listing) | same | upload, replace, delete | none | PDF, PNG, JPEG, WebP, GIF; 10 MB |
| Storage `private-files` | none | none | full, signed URLs for viewing | none | Never linkable from public pages |

## Input handling

- Every form is validated in the browser (Zod) **and** by database constraints. The database is authoritative.
- URLs: only absolute `http(s)`, checked in the browser, the database and again at the edge before any redirect. That rules out open redirects to `javascript:`, `data:` and other schemes.
- Uploads: extension allow-list, size limit, **magic-byte sniffing** of the real content (the browser-supplied MIME type is ignored), bucket-level MIME and size limits, random storage paths. SVG, HTML and executables are rejected.
- Output: React escapes all text. There is no `dangerouslySetInnerHTML` except the QR SVG, which our renderer generates with XML-escaped text. Page data embedded by the edge is JSON-escaped so it cannot close the script tag.
- Contact form: same-origin check, hidden honeypot field, minimum fill time, server-side validation, 3 messages per connection per hour and 100 per hour in total.
- Login redirects (`?next=`) only allow `/admin…` paths.

## HTTP headers (`public/_headers`)

`Content-Security-Policy` (scripts from self only; the Supabase origin is filled in at build time), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and `Strict-Transport-Security`. Dashboard pages also send `X-Robots-Tag: noindex`.

## Privacy

- No IP addresses are stored anywhere. Visitor hashes rotate daily. Scan events older than 90 days are combined into daily totals and deleted, hashes included. Contact hashes are cleared after 30 days. This runs automatically once a day from the keep-alive (`compact_scan_events`).
- No cookies are set for visitors. The only browser storage is the administrator's Supabase session.

## Deployment security checklist

- [ ] Supabase → Authentication: **public sign-ups disabled**.
- [ ] Supabase → Authentication → URL configuration: Site URL and redirect URLs set to the production domain only.
- [ ] All six migrations applied. The security test queries in `DEPLOYMENT.md` § 7 return the expected results.
- [ ] Ingest secret set in the database (`set_edge_ingest_secret`) **and** in Cloudflare as an encrypted variable, with exactly the same value. At least 32 random characters.
- [ ] No service-role or secret key in Cloudflare variables, `.env` files or the repository.
- [ ] `VITE_PUBLIC_APP_URL` is the final HTTPS domain.
- [ ] Administrators use unique, long passwords. Remove access for people who leave by deleting their `admin_users` row.
- [ ] Keep-alive Worker deployed (dashboard shows "Keep-alive: last ran" within 6 hours).
- [ ] Supabase backups understood: the Free plan has no point-in-time recovery. Export data regularly, or move to a paid plan before relying on it commercially.
- [ ] Legal drafts (`/privacy`, `/terms`) reviewed by a qualified adviser and completed with company details.
