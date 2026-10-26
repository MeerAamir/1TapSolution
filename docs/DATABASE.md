# Database

PostgreSQL on Supabase. All changes are SQL migrations in `supabase/migrations/`, applied in filename order:

| Migration | Contents |
| --- | --- |
| `…01_core_schema.sql` | Tables, constraints, validation functions, indexes, triggers |
| `…02_security.sql` | `is_admin()`, grants, Row Level Security policies, file-usage guards, audit triggers |
| `…03_rpc.sql` | Public read functions, edge ingest functions, admin analytics, list views, function privileges |
| `…04_storage.sql` | Storage buckets and policies |
| `…05_admin_writes.sql` | Transactional `admin_save_business` and `admin_save_blocks` |
| `…06_free_tier_guards.sql` | Keep-alive heartbeat, daily scan totals and compaction, usage meter |

`supabase/seed.sql` adds the categories and demonstration data. It is safe to run more than once.

## Tables

| Table | Purpose | Key columns |
| --- | --- | --- |
| `admin_users` | Who may use the dashboard | `user_id` → `auth.users`, `role` (owner, admin, editor) |
| `categories` | Business categories | `name`, unique `slug` |
| `businesses` | Business profile | unique `slug`, contact fields (validated), `accent_color`, `custom_fields` (validated JSON array), `status`, `archived_at`, `is_demo` |
| `business_locations` | One or more addresses | `label`, `address`, `latitude`/`longitude` (both or neither), `maps_url`, `position` |
| `business_hours` | Opening hours | `day_of_week` (0 = Monday), `opens_at`, `closes_at` (overnight ranges allowed) |
| `business_social_links` | Social and other links | `platform`, `url` (http/https only), `position` |
| `files` | Metadata for uploaded files (binaries live in Storage) | `bucket`, `storage_path` (random), `mime_type`, `size_bytes`, `kind`, `show_on_profile`, `version` |
| `qr_codes` | QR codes | unique, immutable `public_code`; `type`; `destination` (validated JSON); `file_id`; `design`; `status`; `archived_at` |
| `content_blocks` | Structured page blocks | `business_id`, `qr_code_id` (null = business profile, set = landing page), `type`, `data` (validated) |
| `qr_scan_events` | Analytics | `qr_code_id`, `business_id`, `occurred_at`, `device_category`, `browser_category`, `visitor_hash` (daily, nullable), `is_simulated` |
| `contact_submissions` | Website enquiries | `name`, `email`, `message`, `status`, `ip_hash` (30 days) |
| `audit_logs` | Append-only change log | `actor_id`, `action`, `entity_type`, `entity_id`, `summary`, changed field names |
| `app_secrets` | Hash of the edge ingest secret | no API access at all |
| `app_heartbeat` | Single row bumped by the keep-alive jobs | `beats`, `last_beat`, `source`, `last_compaction` |
| `qr_scan_daily` | Daily scan totals for events older than 90 days | `day` (UTC), `qr_code_id`, `business_id`, `qr_type`, `device_category`, `browser_category`, `scans`, `unique_visitors` |

Views (`security_invoker`, so the caller's RLS applies): `admin_business_overview`, `admin_qr_overview`, `admin_file_overview` add category and business names, scan counts and usage counts for list screens.

### Constraints worth knowing

- URLs must be absolute `http(s)` (`is_safe_http_url`). `javascript:`, `data:` and similar schemes are rejected by the database itself.
- Phone numbers need 6–15 digits. Emails are format-checked. Colours must be `#RRGGBB`.
- `qr_codes.destination` is validated per type (`is_valid_qr_destination`), and a document QR must reference a file.
- Logos, covers, document QRs and blocks can only reference files in the **public** bucket. A file in use cannot be moved to private.
- `public_code` is generated from 10 random characters (about 59 bits) when omitted, and can never be changed afterwards.

## Lifecycle rules

| Action | Business | QR code | File |
| --- | --- | --- | --- |
| **Deactivate** (`status = inactive`) | Page and all its codes show "currently unavailable" | Code shows "currently unavailable" | n/a |
| **Archive** (`archived_at` set) | Same as inactive, hidden from default lists, restorable | Same, restorable | n/a |
| **Restore** | `archived_at = null` | `archived_at = null` | n/a |
| **Delete** (typed confirmation) | Removes the business, its locations, hours, links, blocks and QR codes. Printed codes show "not recognised". Files are **kept** (unlinked). Scan totals are kept, unlinked. | Removes the code (and its landing blocks). Other codes are untouched. Scan totals kept, unlinked. | Refused by the database while any code, logo, cover or block uses it |
| **Replace** | n/a | n/a | Same file record, new storage object, `version + 1`. Every reference serves the new file at once, and the old object is deleted afterwards. |

## Indexes

Lists and filters: `businesses(lower(name))`, `businesses(status, archived_at)`, `businesses(category_id)`, `qr_codes(business_id)`, `qr_codes(status, archived_at)`, `files(business_id, position)`.

Analytics: `qr_scan_events(qr_code_id, occurred_at desc)`, `(business_id, occurred_at desc)`, `(occurred_at desc)`; `qr_scan_daily(day)`, `(qr_code_id, day)`, `(business_id, day)`.

## Size over time

Raw scan events are kept for 90 days, then combined into one row per day, code, device type and browser. Analytics read both, so charts and totals are unchanged (a test checks this). Old daily totals count unique visitors per code and day; across several codes they are summed.

Rate limiting: `contact_submissions(ip_hash, created_at desc)`.

## Functions

| Function | Callable by | Purpose |
| --- | --- | --- |
| `get_public_qr(code)`, `get_public_business(slug)` | anon, authenticated | Published fields of active records only |
| `edge_resolve_qr(secret, …)` | anon **with the ingest secret** | Resolve and record one scan |
| `submit_contact_form(secret, …)` | anon **with the ingest secret** | Store a validated, rate-limited enquiry |
| `admin_save_business`, `admin_save_blocks` | authenticated admins | Atomic writes |
| `admin_overview_stats`, `admin_scan_series`, `admin_top_qr_codes`, `admin_scan_breakdown`, `file_usage` | authenticated admins | Dashboard data |
| `keep_alive(source)` | anon (rate-limited, one row) | Keeps the Free project active; runs `compact_scan_events` once a day |
| `admin_usage()` | authenticated admins | Database size, file storage, heartbeat for the usage meter |
| `set_edge_ingest_secret(secret)`, `compact_scan_events(days)`, `prune_scan_identifiers(days)` | SQL editor only (no API role) | Operations |

## Changing the schema later

Add a new numbered migration file. Never edit one that has been applied in production. For destructive changes (dropping or renaming columns), add the new column, backfill it, deploy code that uses it, then drop the old one in a later migration.
