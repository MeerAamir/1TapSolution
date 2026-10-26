# Production launch checklist

## Before launch

**Domain and configuration**
- [ ] Final domain chosen and connected in Cloudflare Pages; HTTPS certificate active.
- [ ] `VITE_PUBLIC_APP_URL` set to the final domain; site redeployed.
- [ ] Public contact details (`VITE_CONTACT_*`) set, or intentionally left empty.

**Supabase**
- [ ] All five migrations applied; verification queries in `DEPLOYMENT.md` § 7 return `false`.
- [ ] Public sign-ups disabled; Site URL and Redirect URLs point to the final domain.
- [ ] Custom SMTP configured for password-reset emails.
- [ ] Ingest secret set in the database and Cloudflare (same value).
- [ ] pg_cron clean-up job scheduled.
- [ ] Decision made about the plan: Free projects pause after a week of inactivity and have no point-in-time backups.

**Content**
- [ ] Owner administrator created; test administrator accounts removed.
- [ ] Demo businesses archived or deleted if they should not appear (their QR codes stop working when deleted). Consider keeping one for the website's demo section.
- [ ] Privacy policy and terms reviewed by a qualified adviser and completed with company details. Remove the "Draft for review" notice in `src/pages/marketing/LegalPage.tsx`.

**Checks**
- [ ] Sign in, create a business, create a QR code, scan it with a phone, see the scan in Analytics.
- [ ] Contact form: send a message, see it under Messages.
- [ ] Password reset works end to end.
- [ ] Print test: print each client's first codes at final size and scan with at least two phone models (iOS and Android) in the real lighting.

## After launch

- [ ] Watch Cloudflare's Functions request count (Workers & Pages → Analytics) and Supabase usage (Reports).
- [ ] Export important data regularly if staying on the Free plan.
- [ ] Review the audit log occasionally.
- [ ] Keep dependencies updated: `npm outdated`, then run `npm test`, `npm run test:db` and `npm run build` before deploying.
