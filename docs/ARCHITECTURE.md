# Architecture

## Overview

```
                    ┌────────────────────────── Cloudflare Pages ──────────────────────────┐
 phone camera ──►   │  /q/<code>  ──► Pages Function (functions/q/[code].ts)                 │
                    │                  1. edge_resolve_qr(secret, code, device, browser,     │
                    │                     daily visitor hash)  ──► records ONE scan          │
                    │                  2a. redirect types → 302 Location (no-store)          │
                    │                  2b. page types → index.html + embedded JSON payload   │
                    │  /api/contact ──► Pages Function → submit_contact_form (rate-limited)  │
                    │  everything else → static SPA (React) from dist/                       │
                    └───────────────┬─────────────────────────────────────────────────────────┘
                                    │ HTTPS (anon/publishable key + RLS)
                    ┌───────────────▼──────────────── Supabase ───────────────────────────────┐
                    │  PostgreSQL: tables + RLS + SECURITY DEFINER read/ingest functions      │
                    │  Auth: administrator sign-in (no public sign-up)                       │
                    │  Storage: public-files (public read) / private-files (admins only)     │
                    └──────────────────────────────────────────────────────────────────────────┘
```

Only `/q/*` and `/api/*` invoke Functions (`public/_routes.json`). All other requests are static assets, which are free and unmetered on Cloudflare Pages.

## The four parts of a QR code

| Concept | Where it lives | Changes when… |
| --- | --- | --- |
| **Permanent link**: `https://<domain>/q/<public_code>` | `qr_codes.public_code` (random, 10 characters, immutable; a database trigger refuses changes) | Never |
| **Destination**: what the link opens now | `qr_codes.type`, `qr_codes.destination` (JSON validated by `is_valid_qr_destination`), `qr_codes.file_id` | The admin edits the code |
| **Image**: the downloadable artwork | Rendered on demand from `qr_codes.design` | The admin restyles it; printed copies stay valid |
| **Content**: business details shown on pages | `businesses` and related tables, `files`, `content_blocks` | The admin edits the business; every code that shows it updates |

Wi-Fi codes are the exception. Phones join networks only from data inside the pattern (`WIFI:T:WPA;S:…;P:…;;`), so those codes are static. The dashboard says this clearly, and those scans are not counted.

Contact cards are dynamic: the code opens a page with a "Save contact" button that generates a vCard on the phone. Editing the card updates the same printed code.

## QR resolution flow

1. A visitor scans `https://<domain>/q/AbC123xyz9`.
2. The Pages Function validates the code format, classifies the user agent coarsely (mobile/tablet/desktop, browser family), and computes `SHA-256(secret, UTC date, IP, user agent)`. The IP itself is never sent to the database.
3. It calls `edge_resolve_qr`, which checks the shared ingest secret, resolves the code, and records **one** scan event if the code and business are active. A repeat open from the same visitor within 30 seconds is ignored, as are more than 60 opens per hour per visitor per code. Link-preview bots and dashboard "test link" opens (`?preview=1`) are not recorded.
4. Then:
   - **Website, custom link, social, WhatsApp, Maps, and direct-open documents**: `302` to the destination with `Cache-Control: no-store`, so edits take effect on the next scan. URLs are re-validated at the edge, so `javascript:`/`data:` can never be redirect targets.
   - **Business profile, document page, phone, email, contact card, landing page**: the function serves `index.html` with the page data embedded in a `<script type="application/json">` tag (escaped against injection). The React page renders immediately, with no second round trip.
   - **Unknown code**: `404` with a branded "not recognised" page. **Paused or archived code or business**: `410` with "currently unavailable". Nothing about the business is revealed.
5. If the database is unreachable, the function still serves the app shell, and the page fetches its data directly (read-only).

### Analytics attribution model

- One scan = one request to `/q/<code>` handled by the edge function. The SPA **never** records scans, so a redirect plus page load cannot double count.
- Direct visits to `/b/<slug>` (shared links) are page views, not scans, and are not recorded.
- "Unique visitors" = distinct daily visitor hashes, summed over days. The same person on two days counts twice. People behind one network with the same browser and device type may count once. It is labelled as an estimate everywhere.
- After 90 days, scan events are combined into daily totals and deleted, visitor hashes included (`compact_scan_events`, run daily by the keep-alive). Counts and charts are unchanged.

## Frontend structure

- Route-level code splitting: a phone scanning a code downloads the router, the public page chunk (about 9 KB gzipped) and CSS, never the dashboard, charts or PDF library.
- Public pages use a 20-line `fetch` client (`src/lib/public-api.ts`) instead of `supabase-js`.
- One component (`BusinessProfile`) renders the public page, the `/b/` page and the dashboard's live preview, so all three always match.
- Forms use React Hook Form + Zod. The schemas mirror the database constraints, and the database stays the final authority.
- Saving a business (with hours, locations and links) is one transactional database call (`admin_save_business`), so a failed save never leaves half-updated data.

## Caching

| Path | Policy | Reason |
| --- | --- | --- |
| `/assets/*` | `max-age=31536000, immutable` | Content-hashed filenames |
| `/`, `/index.html`, `/b/*` | `no-cache` | Always revalidate so deploys and content changes show at once |
| `/q/*` | `no-store` (set by the function) | Destinations can change at any time |
| Storage files | Supabase CDN; replaced files get a new path plus `?v=<version>` | A replaced PDF is never served from a stale cache |

## Decisions and trade-offs

- **Cloudflare Pages over Vercel**: Vercel's free Hobby plan is restricted to non-commercial use. Cloudflare's free plan allows commercial projects, and static requests are unmetered. Functions are limited to 100,000 requests a day on the free plan, which is far above early QR traffic.
- **No custom backend**: Supabase plus two edge functions cover every requirement. Sensitive writes go through `SECURITY DEFINER` functions guarded by a shared secret, so the service-role key is never deployed anywhere.
- **Free-plan guards**: a Cloudflare Worker cron keeps the Supabase Free project active (Free projects pause after about a week without database activity), the same call compacts old scans to keep the database small, and images are compressed before upload. See `FREE_HOSTING.md`.
- **Least-privilege ingest**: the edge functions use the public anon key plus a dedicated ingest secret. If that secret leaked, the worst case is fake scan counts, not data access.
- **Own QR renderer**: `qrcode` produces the matrix, and we draw it as vector shapes. That gives real vector SVG and PDF output, styled modules and corner markers, and an automatic error-correction bump for logos. Alignment markers are always drawn solid, because tests showed dot-style alignment markers fail to decode.
- **No arbitrary HTML**: landing pages are built from a fixed set of structured blocks validated in the database. Text is always rendered as text.
- **SVG uploads are refused**: SVG can carry script. Logos must be PNG, JPEG or WebP.

## Future expansion

The schema is ready for these without a rewrite:

- **Roles**: `admin_users.role` already allows owner, admin and editor.
- **Business-owner logins**: add a `business_members(user_id, business_id, role)` table and an extra RLS clause.
- **Subscriptions and quotas**: add `plans` and `business_plans`, enforced in `edge_resolve_qr`.
- **Expiry and scheduling**: add `qr_codes.active_from` and `active_until`, checked in `get_public_qr`.
- **Password-protected destinations, multilingual pages**: new `destination` keys or block variants.
- **Bulk creation and CSV import/export**: batch inserts through the same validated tables.
- **Custom domains and white-label**: `VITE_PUBLIC_APP_URL` is a single setting, and per-business domains map to the same `/q/` handler.
