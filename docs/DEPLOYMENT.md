# Deployment

Target: **Supabase** (database, auth, storage) + **Cloudflare Pages** (website and edge functions), both on free tiers.

You need: a GitHub account with this repository, a Supabase account, and a Cloudflare account. Allow about 30 minutes.

---

## 0. Decide the final domain first

Every printed QR code contains `https://<your-domain>/q/<code>`. Choose the domain you will keep (for example `qr.yourbrand.com`) **before printing any codes**. You can start on the free `*.pages.dev` address for testing, but codes downloaded while `VITE_PUBLIC_APP_URL` points there will keep pointing there.

If you ever move to a new domain, keep the old one connected to the same Cloudflare project so already-printed codes keep working.

## 1. Create the Supabase project

1. In the Supabase dashboard, create a new project. Pick the region closest to most visitors and save the database password somewhere safe.
2. Open **Project Settings → API** (API Keys) and note:
   - the **Project URL** (`https://<ref>.supabase.co`)
   - the **publishable key** (`sb_publishable_…`) or, on older projects, the legacy **anon** key. This one is safe to expose.
   - Do **not** copy the secret or service-role key into any configuration.

## 2. Apply the database migrations

**Quickest: one file.** Open **SQL Editor → New query**, paste the whole of `supabase/setup-all.sql` (all migrations plus demo data, combined) and press **Run**. Use this on a new, empty project.

**Option A: SQL Editor, file by file.** Open **SQL Editor**, then paste and run each file **in order**:

1. `supabase/migrations/20261026000001_core_schema.sql`
2. `supabase/migrations/20261026000002_security.sql`
3. `supabase/migrations/20261026000003_rpc.sql`
4. `supabase/migrations/20261026000004_storage.sql`
5. `supabase/migrations/20261026000005_admin_writes.sql`
6. `supabase/migrations/20261026000006_free_tier_guards.sql`
7. *(optional demo data)* `supabase/seed.sql`

**Option B: Supabase CLI.**

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push            # applies supabase/migrations in order
# then run supabase/seed.sql in the SQL Editor if you want demo data
```

## 3. Create the edge ingest secret

The edge functions prove to the database that a scan or contact message really came from your site using a shared secret.

```bash
openssl rand -base64 48        # or any password manager's 48+ character generator
```

In the **SQL Editor**, run (replace the value):

```sql
select public.set_edge_ingest_secret('PASTE-THE-SECRET-HERE');
```

Keep the same value for step 6. Only a hash is stored in the database.

## 4. Configure authentication

In **Authentication**:

1. **Sign In / Providers → Email**: keep Email enabled and **turn off "Allow new users to sign up"**.
2. **URL Configuration**:
   - **Site URL**: `https://<your-domain>`
   - **Redirect URLs**: `https://<your-domain>/reset-password` (add `http://localhost:5173/reset-password` for local development)
3. **Emails**: Supabase's built-in sender only delivers 2 emails an hour, and only to your Supabase team members. Connect a free SMTP provider for password resets: see [FREE_HOSTING.md](FREE_HOSTING.md) § 3.

Then create the first administrator: follow [ADMIN_SETUP.md](ADMIN_SETUP.md).

## 5. Storage

The storage migration created two buckets:

- `public-files`: public read by exact URL, 10 MB limit, PDF/PNG/JPEG/WebP/GIF only.
- `private-files`: administrators only.

Check under **Storage** that both exist. To raise the 10 MB limit (the Free plan allows up to 50 MB per file), change it on both buckets and set `VITE_MAX_UPLOAD_MB` to match.

## 6. Deploy to Cloudflare Pages

1. In Cloudflare, go to **Workers & Pages → Create → Pages → Connect to Git** and choose this repository.
2. Build settings:
   - Framework preset: **None**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: *(leave empty)*
3. **Environment variables (Production)**. Use the same values for Preview if you deploy previews.

   | Name | Value | Type |
   | --- | --- | --- |
   | `NODE_VERSION` | `22` | Plain text |
   | `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` | Plain text |
   | `VITE_SUPABASE_ANON_KEY` | publishable (or legacy anon) key | Plain text |
   | `VITE_PUBLIC_APP_URL` | `https://<your-domain>` (no trailing slash) | Plain text |
   | `VITE_CONTACT_EMAIL` / `VITE_CONTACT_PHONE` / `VITE_CONTACT_WHATSAPP` | your public contact details, or leave unset | Plain text |
   | `SUPABASE_URL` | same as `VITE_SUPABASE_URL` | Plain text |
   | `SUPABASE_ANON_KEY` | same as `VITE_SUPABASE_ANON_KEY` | Plain text |
   | `EDGE_INGEST_SECRET` | the secret from step 3 | **Encrypt** |
   | `VISITOR_HASH_SECRET` | another random 48+ character value (optional) | **Encrypt** |
   | `FILE_PROXY` and `VITE_FILE_PROXY` | `on` to serve files through Cloudflare's cache (optional, see FREE_HOSTING.md § 4) | Plain text |

4. **Save and Deploy.** Cloudflare builds the site and picks up the `functions/` folder automatically. `public/_routes.json` limits Functions to `/q/*` and `/api/*`, so everything else is static and free.
5. `VITE_*` values are baked in at build time. After changing one, use **Deployments → Retry deployment** to rebuild.

## 7. Verify

Open your site, then check:

- `https://<domain>/` loads the home page, and the demo QR in the hero opens `/q/demoCafe01` (needs the seed).
- `https://<domain>/q/demoStoreIG` redirects to Instagram, which proves the edge function is running.
- `https://<domain>/q/doesNotExist` shows "not recognised".
- `/login`: sign in with the administrator. The overview loads.
- Scan a demo code with a phone, then refresh **Analytics**: one scan appears. If not, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

Run these in the **SQL Editor**. Each should return `false`:

```sql
select has_function_privilege('anon', 'public.set_edge_ingest_secret(text)', 'execute');
select has_function_privilege('anon', 'public.admin_overview_stats(boolean)', 'execute');
select has_table_privilege('anon', 'public.businesses', 'select');
select has_table_privilege('authenticated', 'public.admin_users', 'insert');
```

## 8. Demo PDFs (optional)

The SQL seed cannot upload files. To add the demo café menu and school brochure (and their QR codes `demoMenu01` and `demoBrochure`), run this once from your own computer:

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<secret key, sb_secret_… or legacy service_role> \
npm run seed:files
```

The key stays in your terminal session. Do not save it anywhere.

## 9. Keep it running for free (required)

Supabase pauses Free projects after about a week without database activity. Deploy the free keep-alive Worker and set up free email and backups: follow [FREE_HOSTING.md](FREE_HOSTING.md). It takes about 20 minutes, once. The same keep-alive also runs the daily clean-up (old scans are combined into daily totals, and visitor and contact hashes are removed), so no database scheduler is needed.

## 10. Custom domain (now or later)

1. Cloudflare Pages project → **Custom domains → Set up a domain**. Enter `qr.yourbrand.com` and follow the DNS instructions. If the domain's DNS is already on Cloudflare, it is configured automatically; otherwise add the CNAME record shown.
2. Wait for the certificate to become active.
3. Update `VITE_PUBLIC_APP_URL` to the new domain and redeploy.
4. Update the Supabase **Site URL** and **Redirect URLs** (step 4).
5. Keep any old domain attached if codes using it were already printed.

## Free-tier limits

Every free limit, what happens if it is reached, and how the project guards against it are in [FREE_HOSTING.md](FREE_HOSTING.md).

Sources: [Supabase pricing](https://supabase.com/pricing), [Supabase billing FAQ](https://supabase.com/docs/guides/platform/billing-faq), [Cloudflare Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/), [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Vercel fair use (why not Vercel Hobby)](https://vercel.com/docs/limits/fair-use-guidelines).

## Updating the site

Push to the main branch. Cloudflare rebuilds automatically. Database changes ship as new files in `supabase/migrations/`, applied with step 2 before (or with) the code that needs them.
