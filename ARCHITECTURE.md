# Okavo — architecture guide

Written 12 October 2026 so a different AI on a different computer can work without this chat.

Read this file, then `AGENTS.md`. `docs/architecture/forma-platform.md` is an older thesis from when the product was called FORMA. The running product is Okavo. Do not rename it back, and do not treat that thesis as the schema.

## What it is

Okavo is a two-sided marketplace. A buyer describes software in plain language, reviews a scope, and signs a lock. Identity-checked developers then bid on that frozen scope. Okavo does not hold the build money. The buyer pays the developer milestone by milestone, outside Okavo, after accepting the work. Okavo's own fees (posting, membership, hire success fee) are collected with Razorpay.

Live brand: **Okavo**. Support: `support@okavo.org`.

It is not FunBerry Kids and it is not Data For Dummies.

## Live addresses

| Surface | Address | Status on 12 Oct 2026 |
|---------|---------|------------------------|
| Website | https://okavo.org | HTTP 200. Marketing pages render after JavaScript loads. A screenshot taken too early shows only "Loading…". |
| www | https://www.okavo.org | Redirects to the apex. DNS is a CNAME to `cname.vercel-dns.com`. |
| Older Vercel URL | https://pro-catalog-nu.vercel.app | Still HTTP 200. Same kind of app. Do not delete it until the domain cutover is confirmed in Vercel. |
| GitHub | https://github.com/fkhambaty/okavo | Source of truth. |

The apex `okavo.org` answers through GoDaddy forwarding addresses (`216.198.79.1`, `64.29.17.1`), not through the Vercel CNAME that `www` uses. Forwarding is the fragile part. GoDaddy API keys are created at https://developer.godaddy.com/keys. Do not invent DNS records.

Vercel project name in `docs/deploy.md`: `pro-catalog`, root directory `apps/catalog`.

## How a request moves

```
Browser (Vite React SPA, apps/catalog)
  → Vercel static hosting, with a rewrite to index.html
  → Vercel /api/auth receptionist (HttpOnly refresh cookie, access token in memory)
  → Supabase project fzgnzaflvbimbiseqnrz
      → Auth
      → Postgres + row-level security
      → Edge functions for Razorpay, exams, signup mail, retention
  → Razorpay for the posting fee, the developer membership, and the hire success fee
```

There is no separate application server. If Supabase is paused, sign-in, bids, and payments stop, even when the marketing HTML still loads.

## Repository map

```
apps/catalog/src          React app. Routes are in src/App.tsx.
apps/catalog/api          Vercel functions (auth receptionist, analytics).
supabase/migrations       Schema, RLS, triggers. 25 migrations in git.
supabase/functions        razorpay-order, razorpay-webhook, razorpay-confirm,
                          razorpay-reconcile, exam-analyze, notify-signup,
                          notify-user, identity-retention-sweep.
                          stripe-checkout and stripe-webhook are not the live path.
scripts/okavo.mjs         Operator console. Reads .okavo-agent (gitignored).
docs/deploy.md            Environments and the deploy steps.
brand/                    Brand assets.
ops/, apps/demo-growth/   Earlier prototype. Not part of the live build.
```

## Routes that matter

Marketing: `/`, `/how-it-works`, `/example`, `/guarantee`, `/security`, `/faq`, `/about`, `/terms`, `/privacy`, `/signin`.

Signed-in workspace, under `/app`: project, contract, contracts, messages, notifications, and role-specific pages (buyer intake and payments, developer bids and earnings and verification, admin review).

Fees and copy that quote money live in `apps/catalog/src/lib/pricing.ts`. Change them there. The browser must not tell the server an amount. A payment is marked paid only after a signature-checked webhook (or the confirm path) through `settle_provider_payment`.

## Data and auth

- Production Supabase ref: `fzgnzaflvbimbiseqnrz`
- API settings: https://supabase.com/dashboard/project/fzgnzaflvbimbiseqnrz/settings/api
- Staging is a different project. Set `SUPABASE_PROJECT_REF` before any seed or smoke test.
- `npm run rls` refuses production. Destructive seeds refuse production unless `OKAVO_ALLOW_PRODUCTION_DESTRUCTIVE=1`.
- The service-role key can read identity documents and payments. It belongs in `.okavo-agent`, never in git or in a chat log.
- Sessions must stay on the Vercel auth receptionist. Do not put the session back in `localStorage`.
- Test login `dummy` / `dummy` opens an isolated buyer demo. The demo marker persists in `sessionStorage` so refreshes stay in the test workspace, while marketplace changes reset with the in-memory fixtures. It never creates a Supabase session, reads live rows, or grants developer/admin access; the workspace must label it `Demo data`.
- Demo posting, hiring, and developer membership actions are simulations and must say `no charge`; they must never call Razorpay. Live authenticated accounts keep the real server-created Razorpay order and signature-confirmation path.
- On 12 Oct 2026 the auth health URL for this project did not return a healthy response. Treat "the site is up" and "the database is up" as two different facts.

Two database rules are the product:

- A buyer posting fee is consumed once, inside Postgres, before a requirement row is inserted.
- A developer cannot bid until `bidding_unlocked_at` is set. The UI disable is not the security check.

## Local run

```bash
npm install
npm run dev          # http://127.0.0.1:5180
cd apps/catalog && npx tsc -b --force
npm run build
```

`npx tsc --noEmit` is the wrong check. This app uses TypeScript project references. Use `tsc -b --force`.

Copy `scripts/env.example` to `.okavo-agent` and `apps/catalog/env.example` to `apps/catalog/.env.local`.

## Design system

The catalog UI is a warm editorial system: paper (`--paper`, `--bg`), ink (`--ink`), and one amber signal (`--accent`). Tokens and primitives live in `apps/catalog/src/index.css`. Shared React pieces are `LoadingState` (route and gate waits), `MarketingLayout` (public chrome), and `AppShell` (signed-in chrome). Sign-in uses `AuthFrame` in `pages/SignIn.tsx`.

Prefer the semantic aliases (`--text`, `--border`, `--focus-ring`, `--on-ink`, `--measure`) over new hex values. Status colours stay honest: green is a lock or a live connection, amber is attention, red is a real failure. Do not add testimonials, counts, logos, escrow, or a delivery guarantee in the visual layer. Motion is short (`--dur`) and turns off under `prefers-reduced-motion`. Prices stay in `apps/catalog/src/lib/pricing.ts`. Security copy stays in the page source and in `apps/catalog/src/content/trust.ts`.

## What not to get wrong

- Do not invent testimonials, country counts, or customer logos. A fake "74 countries" claim was removed once already.
- Do not say Okavo holds escrow or guarantees delivery. It does not.
- Fees are shown in USD. Razorpay collects the INR equivalent until a USD processor is live.
- Trademark clearance for the name was still outstanding when this guide was written. Do not claim the name is cleared.
