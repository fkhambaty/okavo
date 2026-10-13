# Okavo — notes for an AI agent working in this repo

Read [`ARCHITECTURE.md`](ARCHITECTURE.md) first if you are on a new computer. It is the map of hosting, DNS, database, payments, and the failures that look like bugs. This file is the editing contract. `docs/architecture/forma-platform.md` is an older thesis from before the rename to Okavo. It is not the running system.

Okavo is a two-sided marketplace. Buyers describe software in plain language,
sign a scope ("the lock"), and identity-verified developers bid on that exact
scope. Live at <https://okavo.org>.

## Environments

| Environment | Backend | When to use |
|-------------|----------|-------------|
| **Production** | Cloudflare D1 `okavo` via Worker `okavo-api` | Live site at okavo.org |
| **Local** | same Worker URL in `VITE_OKAVO_API_URL`, or fixtures when it is unset | UI work. Dummy login never hits the Worker |

Copy [`scripts/env.example`](scripts/env.example) to `.okavo-agent` (or
`.env.local`) and [`apps/catalog/env.example`](apps/catalog/env.example) to
`apps/catalog/.env.local`. (Root `.gitignore` ignores `.env.*`, so the
trackable templates live without that prefix.) Never put production
service-role keys in CI.

Destructive scripts (`seed:accounts`, `seed:test`) refuse production unless
`OKAVO_ALLOW_PRODUCTION_DESTRUCTIVE=1`. `npm run rls` refuses production always.

## Driving the app

There is a console for reading live D1 rows. It does not mint sessions and it
does not insert sample people or requirements:

```bash
node scripts/okavo.mjs help
```

| Command | What it does |
|---------|--------------|
| `check` | Confirm Wrangler can read D1 |
| `accounts` | Every user, role, verification state. No password hashes |
| `blocks` | Blocked developers and block requests |
| `payments` | Pending payments |
| `files` | Retention counts. No file bytes |
| `exams` | Build-exam queue counts |
| `liquidity` | Live marketplace counts |
| `screens` | Every route and who may see it, read from the router |
| `shot <path>` | Screenshot a public page |

```bash
node scripts/okavo.mjs accounts
node scripts/founder-status.mjs
```

`founder-status` prints the hand steps and the real counts. It does not insert
rows. Set `OKAVO_SITE=http://127.0.0.1:5180` to screenshot the local site.

## Credentials

`scripts/okavo.mjs` reads D1 through Wrangler. Do not print Cloudflare tokens.
The old Supabase service-role console is retired.

## Test accounts

`npm run seed:accounts`, `seed:test`, and `rls` exit immediately. They used to
write Supabase rows. `npm run smoke` checks the live site without creating an
account or a charge. The dummy login (`dummy` / `dummy`) stays in the browser
and is labelled demo data. Real accounts are created at
https://okavo.org/signin.

## Ground rules

- **Never invent social proof.** No testimonials, customer logos, or usage
  numbers that are not real. The About page commits to this, and the homepage
  previously carried a fabricated "74 countries" claim that had to be removed.
- **Never claim a feature that is not switched on.** Okavo does not hold build
  funds and does not offer a delivery guarantee. Escrow tables may exist in
  older migrations but are not enabled; keep marketing honest.
- Prices live in `apps/catalog/src/lib/pricing.ts`. Change them there, never
  inline, or the site will quote one number and charge another. Fees are shown
  in USD; Razorpay still collects INR equivalents until Stripe USD is live.
- Payment amounts are decided in the edge functions, never accepted from the
  browser, and a payment is only marked paid by a signature-verified webhook
  (or confirm path) through `settle_provider_payment`.
- Sessions use the Vercel `/api/auth` receptionist: HttpOnly refresh cookie +
  memory-only access token. Do not reintroduce `localStorage` session persistence.

## Checking your work

```bash
cd apps/catalog && npx tsc -b --force   # `tsc --noEmit` alone does NOT check this project
npm run build                            # also prerenders the marketing pages
npm run lint
npm run typecheck
npm test                                 # Worker pure tests
VITE_OKAVO_API_URL=https://okavo-api.fkhambaty.workers.dev npm run build
npm run responsive                       # after that build; see docs/responsive.md
```

`npx tsc --noEmit` silently passes because the project uses TypeScript project
references. Use `tsc -b --force`.

## Layout

| Path | What |
|------|------|
| `apps/catalog/src` | The React app |
| `apps/catalog/api` | Vercel edge functions (auth receptionist, analytics collector) |
| `cloudflare/worker` | Production API |
| `cloudflare/d1` | D1 schema |
| `supabase/` | Retired. Not the live database |
| `scripts` | Seeding, smoke tests, RLS matrix, the agent console |
| `.github/workflows` | CI + optional staging RLS/smoke; weekly identity sweep + Razorpay reconcile |
