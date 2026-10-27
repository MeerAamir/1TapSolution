# Troubleshooting

### The site shows "Connect a Supabase project"
`VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` was missing **at build time**. Add them in Cloudflare Pages → Settings → Variables, then **retry the deployment** (they are baked into the build).

### Sign-in says "This account does not have administrator access"
The login exists but has no `admin_users` row. Run the `insert` in [ADMIN_SETUP.md](ADMIN_SETUP.md) for that email.

### Sign-in fails with "Failed to fetch" or the dashboard cannot load data
- Check `VITE_SUPABASE_URL` is exactly `https://<ref>.supabase.co`, with no trailing path.
- The Content-Security-Policy is generated from `VITE_SUPABASE_URL` at build time. If you changed the Supabase URL (for example to a custom domain), rebuild.
- The Supabase project may be paused (Free projects pause after about a week without database activity). Open the Supabase dashboard and **Restore** it, then check the keep-alive Worker is deployed and its cron trigger is set (`FREE_HOSTING.md` § 1).

### QR codes open the page but scans are not counted
- `EDGE_INGEST_SECRET` in Cloudflare must equal the value given to `set_edge_ingest_secret`. If unsure, set a new value in both places.
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` must be set as Cloudflare variables (not only the `VITE_` ones).
- Test-link opens from the dashboard (`?preview=1`), link-preview bots, and repeat opens within 30 seconds are deliberately not counted.
- Locally, `npm run dev` does not run the edge functions. Use `npm run dev:edge`.

### A QR code shows "currently unavailable"
The code, or its business, is inactive or archived. Open it in the dashboard and choose **Reactivate** or **Restore**. The banner at the top of the code's page names the cause.

### A QR code shows "not recognised"
The code was deleted, or the link was mistyped. Deleted codes cannot be restored. Create a new code; it will have a new link.

### A printed code does not scan well
- Print larger. As a rule of thumb, the code should be at least one tenth of the scanning distance (2 cm from 20 cm).
- Use dark modules on a light background with strong contrast (the editor warns below 7:1), and keep the white margin.
- Remove the logo or reduce its size, or raise error correction to Q or H.
- Avoid glossy laminates that reflect light. Always scan a printed proof with two or three phones before a large print run.

### Uploads fail
- Only PDF, PNG, JPEG, WebP and GIF are accepted, up to `VITE_MAX_UPLOAD_MB` (default 10 MB). The file's real content must match its extension.
- "Bucket not found": the storage migration (`…04_storage.sql`) was not applied.

### "This file is still in use" when deleting
A QR code, logo, cover or content block still references it. The dialog lists where. Remove those references, or use **Replace file** instead.

### Password-reset email never arrives
Supabase's built-in sender sends only 2 emails an hour, and only to your Supabase team. Connect free Brevo SMTP (`FREE_HOSTING.md` § 3), and check the Redirect URLs include `/reset-password` on your domain.

### Analytics chart says "Chart unavailable"
The error message is shown in the chart area. A time-zone error means an unrecognised zone was set in `VITE_ANALYTICS_TIMEZONE`. Use an IANA name such as `Asia/Kolkata`, or leave it empty.

### Build fails on Cloudflare
- Set `NODE_VERSION=22`.
- The build runs strict type checks (`tsc`). Run `npm run build` locally to see the same errors.

### The dashboard says the keep-alive has not run
Open the keep-alive Worker's URL. It shows what is wrong (for example `database: error 401` means the key is wrong). In Cloudflare, check **Settings → Triggers** has the cron `17 */6 * * *`, and **Settings → Variables** has `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

### An upload says "larger than 10 MB even after compression"
Photos up to 25 MB are accepted and compressed automatically, but some images (very detailed PNGs with transparency) stay large. Save it as JPEG, or reduce its size, then upload again.

### Cloudflare ignores the variables set in the dashboard
Do not add a `wrangler.toml` at the repository root. When Pages finds one, it becomes the source of truth and the dashboard's variables are not used (the build log says "Build environment variables: (none found)"). The keep-alive Worker's config lives in `workers/keepalive/` and does not affect the site.
