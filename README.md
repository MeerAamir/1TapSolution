# 1 Tap Solution

**Your Business. One Tap Away.**

A dynamic QR code and business-page platform. An administrator creates businesses, builds their mobile pages, and issues QR codes that point to permanent links. What a code opens (a business profile, a PDF menu, a website, WhatsApp, Google Maps, a contact card, a custom landing page and more) can be changed at any time without reprinting the code.

- **Public website** with a working demo QR code, features, solutions, FAQ and a protected contact form.
- **Administrator dashboard**: businesses, QR codes, categories, files & documents, analytics, messages, settings, audit log.
- **Customer pages** at `/q/<code>` and `/b/<slug>`, built mobile-first and loaded with minimal JavaScript.
- **Dynamic QR codes** with design controls (colours, module and corner styles, centre logo, frame, call to action), scan-reliability warnings, and PNG, vector SVG and print-ready PDF downloads.
- **Privacy-conscious analytics**: scans recorded server-side before redirecting, no IP addresses stored, daily-rotating anonymous visitor estimate.
- **Security**: Supabase Auth, Row Level Security on every table, admin rights only in the database, validated uploads, and no open redirects.

## Technology

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | React 19, TypeScript (strict), Vite, Tailwind CSS 4, Radix primitives, React Router, React Hook Form + Zod, Recharts, Lucide | Fast, maintained, accessible components |
| Database, auth, files | Supabase (PostgreSQL, Auth, Storage) | One free-tier service for all three, with RLS |
| Hosting + edge logic | Cloudflare Pages + Pages Functions | Free static hosting that allows commercial use, plus server-side redirects and scan recording |
| QR | `qrcode` (matrix) + own vector renderer | True vector SVG/PDF, styled modules, decode-tested |

There is no custom Node.js server. The only server code is two small edge functions (`functions/`): the QR resolver and the contact form endpoint. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick start (local development)

```bash
npm install
cp .env.example .env.local      # fill in your Supabase URL and anon/publishable key
npm run dev                     # http://localhost:5173
```

You need a Supabase project with the migrations applied. The full setup is in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), and creating the first administrator is in [docs/ADMIN_SETUP.md](docs/ADMIN_SETUP.md).

`npm run dev` serves the app without the edge functions. QR pages still work, because the page loads its data itself, but scans are not recorded and redirects happen in the browser. To run the real edge functions locally:

```bash
npm run dev:edge   # builds, then serves dist/ with Cloudflare's local runtime (wrangler)
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check app, tests and edge functions, then build to `dist/` |
| `npm run typecheck` | Type-check only |
| `npm run lint` | Lint with oxlint |
| `npm test` | Unit and edge-function tests (Vitest) |
| `npm run test:db` | Database integration tests against a local Postgres (migrations, RLS, functions) |
| `npm run e2e:stack` / `npm run test:e2e` | Full browser tests against a local Supabase-equivalent stack |
| `npm run seed:files` | Upload demo PDFs and create the demo document QR codes |

Test details and results are in [docs/TESTING.md](docs/TESTING.md).

## Project structure

```
functions/                 Cloudflare Pages Functions (edge)
  q/[code].ts              /q/<code>: resolve, record scan, redirect or render
  api/contact.ts           contact form endpoint
public/                    _headers (security + caching), _routes.json, favicon
scripts/                   seed-demo-files.mjs
src/
  auth/                    AuthProvider, RequireAdmin
  components/
    admin/                 dashboard building blocks (block editor, file picker, charts…)
    brand/                 logo
    public/                customer-facing page components
    qr/                    QrSvg
    ui/                    shared UI kit
  lib/
    edge/                  edge handlers, user-agent classification, key headers
    qr/                    QR types, destinations, renderer, design rules, exports
    validation/            Zod schemas (mirrors database constraints)
    admin-api.ts           dashboard data access
    public-api.ts          tiny public read client (no supabase-js)
    files.ts               upload validation and storage
  pages/
    marketing/ auth/ public/ admin/
supabase/
  migrations/              schema, security, RPCs, storage, transactional writes
  seed.sql                 demonstration data
tests/
  unit/ edge/              Vitest
  db/                      database integration tests
  e2e/                     Playwright tests and local stack
docs/                      architecture, database, security, deployment, testing…
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md): QR resolution flow, analytics model, caching, decisions
- [Database](docs/DATABASE.md): schema, lifecycle rules, access matrix
- [Security](docs/SECURITY.md): model and deployment checklist
- [Deployment](docs/DEPLOYMENT.md): Supabase and Cloudflare, step by step, plus custom domains and free-tier limits
- [Administrator setup](docs/ADMIN_SETUP.md)
- [Testing](docs/TESTING.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Launch checklist](docs/LAUNCH_CHECKLIST.md)

## Licence

Private. All rights reserved by the project owner.
