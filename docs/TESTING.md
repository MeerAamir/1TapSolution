# Testing

Four layers, each run for real during development (results at the end).

| Suite | Command | What it runs against |
| --- | --- | --- |
| Unit + edge | `npm test` | Vitest: QR rendering decoded back with a real QR decoder (jsQR), validation, upload sniffing, URL safety, edge handlers with a fake Supabase |
| Database integration | `npm run test:db` | A throw-away PostgreSQL database built from the **real migrations** plus a minimal Supabase shim; queries run as `anon`, a non-admin user and an admin, exactly as the API would |
| Browser (end to end) | `npm run e2e:stack`, then `npm run test:e2e` | Chromium (Playwright) against a full local stack: PostgreSQL, **Supabase Auth**, **PostgREST**, a gateway with the Supabase URL layout, and the built site served by **Wrangler** (Cloudflare's Pages runtime, so the real edge functions run) |
| Static checks | `npm run typecheck`, `npm run lint`, `npm run build` | Strict TypeScript for app, tests and edge functions; oxlint; production build |

## Running the database tests

Needs a local PostgreSQL 15+ you can create databases on. Default: `postgresql://postgres@127.0.0.1:54329/postgres`. Override with `TEST_DATABASE_URL`.

```bash
TEST_DATABASE_URL=postgresql://postgres@localhost:5432/postgres npm run test:db
```

Each run creates and drops its own database.

## Running the browser tests

1. Download two release binaries from GitHub into one folder, `E2E_BIN_DIR`:
   - PostgREST `postgrest-v12.2.3-linux-static-x64.tar.xz`, extracted to `$E2E_BIN_DIR/postgrest`
   - Supabase Auth `auth-v2.180.0-x86.tar.gz`, extracted to `$E2E_BIN_DIR/auth/` (contains `auth` and `migrations/`)
2. Have PostgreSQL running (`E2E_PG_URL`, default `postgresql://postgres@127.0.0.1:54329`).
3. Start the stack and run the tests:

   ```bash
   E2E_BIN_DIR=/path/to/bin npm run e2e:stack      # keep running
   npx playwright install chromium                  # once, or set E2E_CHROMIUM=/path/to/chrome
   npm run test:e2e
   ```

The stack script creates the database, runs the Auth migrations, applies our migrations and seed, creates an admin and a non-admin user through the Auth admin API, builds the site and serves it with Wrangler on `http://127.0.0.1:8788`.

The local gateway includes a tiny in-memory file store in place of Supabase Storage. Storage **policies** are covered by the database tests instead.

## Required scenarios → tests

| # | Scenario | Covered by |
| --- | --- | --- |
| 1 | Administrator can log in | e2e `auth.spec` › sign in, return to requested page, sign out |
| 2 | Unauthenticated visitor cannot access the dashboard | e2e `auth.spec` › redirected to login |
| 3 | Unauthorised user cannot perform admin operations | db `security.test` (anon and non-admin: no reads, no writes, no self-promotion, admin functions refused); e2e non-admin refused at login; e2e anon API calls rejected |
| 4 | Admin can create a business | e2e `lifecycle.spec` › creates a business; db transactional save |
| 5 | Admin can edit a business | e2e › edits flow to the public page |
| 6 | Admin can upload a document | e2e › uploads a document (plus a disguised executable is refused) |
| 7 | Admin can create a dynamic QR code | e2e › creates a dynamic document QR code; db code generation |
| 8 | QR code can be scanned and opens the correct destination | unit: every style decoded with jsQR; e2e: downloaded PNG and SVG decode to the code's URL, and opening it shows the document; edge: redirects for website, WhatsApp, Maps, documents |
| 9 | Editing a business changes the public page | e2e › edits flow to the public page; db › edits flow to `get_public_qr` |
| 10 | Public identifier unchanged after editing | e2e › replacing the PDF / changing the destination keeps the link; db › public code cannot be changed |
| 11 | Replacing a PDF changes the document served | e2e › new file content served on the same code (`?v=2`); db › same |
| 12 | Disabling makes the destination unavailable | e2e › 410 "currently unavailable", no business details shown; db › same |
| 13 | Reactivating restores access | e2e and db › reactivate |
| 14 | Deleting a QR code doesn't affect other businesses | e2e › delete; db › delete code and delete business |
| 15 | Unauthorised visitors cannot access private files | db › private files can't be linked to public pages, anon cannot list or upload storage objects; e2e › anon key cannot read `files` |
| 16 | Invalid URLs are rejected | unit › URL safety table; db › database rejects unsafe URLs; e2e › business form and QR editor show errors; edge › never redirects to unsafe schemes |
| 17 | Analytics are recorded correctly | db › scan series, unique visitors, top codes, breakdowns; e2e › one scan recorded per visit and dashboard charts show it |
| 18 | One visit isn't counted twice | db › 30-second de-duplication, page views never record; e2e › reload does not add a scan; edge › preview and bot opens not recorded |
| 19 | Missing or invalid QR identifiers handled | db › unknown, malformed and injection-like codes; edge › 404 without a database call; e2e › branded "not recognised" page |
| 20 | Mobile pages render correctly | e2e `mobile.spec` (Pixel 7): no sideways scroll on home, profile, landing page, contact card, business, missing and legal pages; 44 px touch targets; mobile menu; dashboard on phone |
| 21 | PNG and SVG exports are valid | e2e › downloaded 2048 px PNG decoded; SVG is pure vector (no `<image>`), parsed by a strict SVG renderer and decoded; PDF header valid; unit › quiet zone and aspect checks |
| 22 | Production build completes | `npm run build` (includes strict type checks of app, tests and edge functions) |

## Results of the last full run (26 October 2026)

| Suite | Result |
| --- | --- |
| `npm test` | 77 passed |
| `npm run test:db` | 65 passed |
| `npm run test:e2e` | 31 passed (21 desktop, 10 mobile) |
| `npm run typecheck`, `npm run build` | Pass |
| `npm run lint` | 0 errors (warnings only: React fast-refresh hints and deliberate load-into-state effects) |

Real problems these tests found and that were fixed: anonymous visitors could call internal database functions (Supabase grants `EXECUTE` to `anon` by default); dot-style alignment markers did not decode at high resolution; the Content-Security-Policy blocked non-default Supabase domains; a legacy browser time-zone name (`Asia/Calcutta`) broke analytics charts; the edge function fetched `/index.html`, which Cloudflare Pages redirects.

## Not covered by automated tests

- Real phone cameras on printed codes. Rendered images are decoded in tests, but print size, paper, lighting and lenses vary. Do the printed-proof check in `LAUNCH_CHECKLIST.md`.
- Email delivery for password resets (depends on your SMTP provider).
- Supabase Storage itself (replaced by an in-memory store in the browser tests; its policies are tested at database level).

## Simple QR studio

| Behaviour | Covered by |
| --- | --- |
| A pasted address (even without `https://`) is live as soon as it is valid, with no save button and no business | `tests/e2e/studio.spec.ts` |
| One multi-link page holds links, phone, contact card and Wi-Fi items; the phone preview and the visitor page show them | `tests/e2e/studio.spec.ts`, `tests/db/studio.test.ts` |
| Text codes show the text with a Copy button | `tests/e2e/studio.spec.ts`, `tests/db/studio.test.ts` |
| Invalid content is never saved, so printed codes keep opening the last good content | `tests/e2e/lifecycle.spec.ts` (changing the destination) |
| The hidden workspace owner is admin-only, never listed as a business and never shown to visitors | `tests/db/studio.test.ts` |
| Download (PNG, SVG, PDF) from the studio produces codes that decode to the permanent link | `tests/e2e/lifecycle.spec.ts` |

## Menus, payments, reviews, page style and end dates

| Behaviour | Covered by |
| --- | --- |
| Menu codes show sections, prices and veg marks; blank rows are ignored; photo/PDF menus resolve their files and refuse deleting files in use | `tests/e2e/extras.spec.ts`, `tests/unit/menus-payments.test.ts`, `tests/db/menus-payments.test.ts` |
| Payment pages build correct UPI links for every app; invalid UPI IDs, amounts, IFSC and unsafe links are refused in the browser and the database | `tests/e2e/extras.spec.ts`, `tests/unit/menus-payments.test.ts`, `tests/db/menus-payments.test.ts` |
| A plain UPI code encodes the payment itself and decodes back exactly | `tests/unit/menus-payments.test.ts` |
| Google review codes redirect to the review form (link or Place ID) | `tests/e2e/extras.spec.ts`, `tests/unit/menus-payments.test.ts` |
| Page styles (font, gradient, buttons) reach visitors; unsafe colours, fonts and values are rejected | `tests/e2e/extras.spec.ts`, `tests/unit/menus-payments.test.ts`, `tests/db/menus-payments.test.ts` |
| Expired codes return 410 “not active right now”, are not counted, show as Expired in the list and unlock in one tap | `tests/e2e/extras.spec.ts`, `tests/db/menus-payments.test.ts` |
| Renewing early adds to the current end date; month ends are clamped | `tests/unit/menus-payments.test.ts` |
