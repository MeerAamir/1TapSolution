// Combines every migration and the demo seed into supabase/setup-all.sql (one paste in the SQL Editor).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
const files = [
  ...readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort().map((f) => `supabase/migrations/${f}`),
  'supabase/seed.sql',
]
const head = `-- =============================================================================
-- 1 TAP SOLUTION — complete database setup (all migrations + demo data)
-- Paste this whole file into Supabase → SQL Editor → New query, then Run.
-- Run it ONCE on a new, empty project. Generated from supabase/migrations + seed.sql.
-- =============================================================================
`
writeFileSync('supabase/setup-all.sql', head + files.map((f) => `\n-- >>>>> ${f}\n${readFileSync(f, 'utf8')}`).join(''))
console.log(`Wrote supabase/setup-all.sql from ${files.length} files`)
