# Running 1 Tap Solution for free, reliably

Everything here runs on free plans with **no card and no monthly bill**. Free plans have limits, and a few of them would stop a site after days or weeks if nobody handled them. This guide lists every limit, what happens if it is reached, and what the project already does about it.

## The free stack

| Service | Used for | Cost |
| --- | --- | --- |
| Cloudflare Pages | Website, QR redirects, contact form, optional file cache | Free |
| Cloudflare Workers | Keep-alive job every 6 hours | Free |
| Supabase | Database, admin sign-in, file storage | Free |
| GitHub | Code, second keep-alive, weekly database backup | Free (private repository) |
| Brevo | Password-reset emails | Free (300 emails a day) |
| Domain | `your-project.pages.dev` | Free. A custom domain such as `qr.yourbrand.com` must be bought from a registrar. |

## Every limit, and how it is handled

| Limit (free plan) | What would happen | What the project does | Your part |
| --- | --- | --- | --- |
| **Supabase pauses projects after about 7 days without database activity** | Website pages load, but every QR page, login and dashboard stops working until someone restores the project. After 90 days a paused project can no longer be restored, only downloaded. | A Cloudflare Worker writes a small heartbeat to the database **every 6 hours** (`workers/keepalive`). A GitHub workflow does the same twice a week as a backup. The dashboard warns if no heartbeat arrived for 2 days. | Deploy the keep-alive Worker once (step 1 below). |
| Supabase database 500 MB | Database can become read-only | Scan records older than 90 days are combined into daily totals automatically (run by the keep-alive, no setup needed). A business with 1,000 scans a day stays far below the limit. **Settings → Free plan usage** shows the size. | Glance at the usage meter now and then. |
| Supabase file storage 1 GB | New uploads fail | Photos are resized to 1,920 px and compressed **before** upload (a 12 MB phone photo usually becomes 0.3–0.8 MB). Large PDFs show a warning. The usage meter shows storage used. | Keep PDFs small: export menus with "reduce file size". Delete files you no longer need. |
| Supabase bandwidth 5 GB a month (plus 5 GB served from its CDN) | After a grace period, Supabase may restrict the project, for example by rejecting requests, until the next month | Compressed images; files cached in browsers for a year; optional **Cloudflare file cache** (step 4) so Supabase sends each file about once instead of once per visitor | Turn on the file cache when you add a custom domain. Check Supabase → Usage monthly in the first months. |
| Cloudflare Functions: 100,000 requests a day | QR scans fail for the rest of that day (resets at 05:30 India time, which is midnight UTC) | Only QR links, the contact form and the optional file cache use Functions. Normal pages are static and unlimited. | Nothing until you pass roughly 50,000 scans a day. |
| Cloudflare Workers cron: 5 per account | n/a | The keep-alive uses 1 | None |
| Supabase built-in email: 2 emails an hour, only to your team | Password resets for other administrators fail | n/a | Connect Brevo SMTP (step 3). |
| GitHub Actions: 2,000 minutes a month (private repo) | n/a | The workflow uses about 2 minutes a week | None |
| Supabase Free has no point-in-time restore | A mistake (for example deleting a business) cannot be undone from Supabase | Weekly database backup kept for 90 days on GitHub (step 2) | Add the database secret once. |

**An honest limit:** free plans are set by the providers and can change. Nothing free comes with an uptime guarantee. This setup removes every *known* reason the site would stop on its own, and the dashboard warns you early. If the client's business comes to depend on it, the cheapest upgrade with the biggest effect is Supabase's paid plan: no pausing, daily backups, more storage.

---

## Setup (about 20 minutes, once)

Do these after the normal deployment in [DEPLOYMENT.md](DEPLOYMENT.md).

### 1. Keep-alive Worker (required)

**In the Cloudflare dashboard, no tools needed:**

1. Go to **Workers & Pages → Create → Create Worker**. Name it `1tap-keepalive` and choose **Deploy**.
2. Choose **Edit code**, replace everything with the contents of `workers/keepalive/worker.js`, then **Deploy**.
3. Go to **Settings → Variables and Secrets** and add:
   - `SUPABASE_URL`: `https://<ref>.supabase.co`
   - `SUPABASE_ANON_KEY`: your public anon or publishable key
   - `SITE_URL`: your site address, for example `https://your-project.pages.dev` (optional; it also checks the website is up)
4. Go to **Settings → Triggers → Cron Triggers → Add** and enter `17 */6 * * *` (every 6 hours).
5. Open the Worker's URL (`https://1tap-keepalive.<you>.workers.dev`). You should see `"ok": true`.
6. In the dashboard, **Settings → Free plan usage** now shows "Keep-alive: last ran … (manual-check)". After the first scheduled run it shows `cloudflare-cron`.

**Or with the command line:**

```bash
npx wrangler login
npx wrangler deploy --config workers/keepalive/wrangler.toml
npx wrangler secret put SUPABASE_URL --config workers/keepalive/wrangler.toml
npx wrangler secret put SUPABASE_ANON_KEY --config workers/keepalive/wrangler.toml
```

### 2. GitHub: second keep-alive and weekly backups (recommended)

In the GitHub repository, go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret | Value |
| --- | --- |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | public anon or publishable key |
| `SUPABASE_DB_URL` | In Supabase, choose **Connect** and copy the **Session pooler** connection string. Replace `[YOUR-PASSWORD]` with your database password. |

The workflow `.github/workflows/keepalive-and-backup.yml` runs on Mondays and Thursdays. Every Monday it saves a backup (roles, schema and data) that you can download for 90 days from **Actions → Keep-alive and backup → a run → Artifacts**. Start it by hand once with **Run workflow** to check it works.

GitHub turns off scheduled workflows in **public** repositories after 60 days without commits. Keep the repository private, or rely on the Cloudflare Worker, which has no such rule.

To restore a backup into a new Supabase project: run `roles.sql`, then `schema.sql`, then `data.sql` in that order with `psql`. Uploaded files are not part of this backup. Keep your original PDFs and logos, or download them from Supabase Storage occasionally.

### 3. Free email for password resets (recommended)

1. Create a free account at Brevo and add a verified sender address (for example your Gmail).
2. In Brevo, open **SMTP & API**. Note the SMTP server, port, login and create an SMTP key.
3. In Supabase, go to **Authentication → Emails → SMTP Settings**, turn on custom SMTP and enter the same values. Sender email = your verified address.

Free: 300 emails a day. Password resets will never come close.

### 4. Cloudflare file cache (optional, recommended once you use a custom domain)

When it is on, menus, brochures and photos are served from your own site at `/f/…` and cached by Cloudflare, so Supabase's monthly bandwidth is barely used.

1. Cloudflare Pages project → **Settings → Variables**: add `FILE_PROXY` = `on` and `VITE_FILE_PROXY` = `on`.
2. **Deployments → Retry deployment**.

Cloudflare's cache works on custom domains. On a free `*.pages.dev` address files still load through `/f/`, but may not be cached, so leave it off there unless you have a reason to use it. Each file view then counts as one of the 100,000 daily Function requests.

---

## Monthly two-minute check

- Dashboard → **Settings → Free plan usage**: both bars green, "Keep-alive: last ran" within the last 6 hours.
- Supabase → **Usage**: egress well under 5 GB.
- GitHub → **Actions**: the last Monday run has a backup artifact.
