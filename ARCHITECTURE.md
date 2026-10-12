# Okavo — architecture guide

Written 12 October 2026 so a different AI on a different computer can work without this chat.

## Backend as of 13 October 2026

Production no longer uses Supabase. The project `fzgnzaflvbimbiseqnrz` was deleted. Accounts, marketplace rows, and payment records live in the existing Cloudflare D1 database `okavo` (`3d3afb8e-1749-4c70-8001-e115504e3b03`) on account `ec00d4a6131c20118d82605d6b969c8e`. The API is the Worker `okavo-api` at `https://okavo-api.fkhambaty.workers.dev` (`cloudflare/worker`). The browser calls that Worker with a short-lived bearer token. The Vercel `/api/auth` routes still own the HttpOnly refresh cookie and never put the session in `localStorage`.

Signup does not create a session until a 6-digit email code is confirmed. Password reset uses the same kind of code. Sending those codes requires the `okavo.org` domain to be verified in Resend. On 13 October 2026 Resend rejected `Okavo <support@okavo.org>` with “The okavo.org domain is not verified.” Until that domain is verified, signup and password-reset return an error and do not create a session. A profile inserted directly in D1 with `email_verified_at` set can still log in. The Worker chooses Razorpay amounts. A payment is marked paid only after a verified signature and, when live charges are switched on, a captured Razorpay payment whose amount matches the stored order. Live charges are on: the Worker holds the FKTech live key (`RAZORPAY_KEY_ID` var, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` secrets) with `RAZORPAY_PAYMENTS_ENABLED = "true"`. One FKTech Razorpay account serves Okavo, FunBerry Kids and Data For Dummies, and checkout shows FKTech as the merchant. Setting the flag to anything else stops order creation before Razorpay is called. The dummy login (`dummy` / `dummy`) stays in the browser, uses fixture rows, and never calls the Worker or Razorpay.

```
Browser
  → Vercel (okavo.org) static app
  → Vercel /api/auth (HttpOnly refresh cookie; access token stays in memory)
  → Worker https://okavo-api.fkhambaty.workers.dev
  → D1 database okavo
```

These routes are intentionally unimplemented and return an error instead of invented data:

- Identity document and payment-proof file storage (no object bucket is configured).
- Starting, scoring, or deciding a build exam. The exam queue is empty and starts are paused.
- Requirement-assist language models. The page keeps the local heuristic only.
- Stripe checkout, the Razorpay reconcile cron, and the identity-retention sweep.
- Passwordless operator tokens. `scripts/okavo.mjs` database commands no longer talk to Supabase.

Older sections below that name Supabase describe the system as it was on 12 October 2026.

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
  → Razorpay (shared FKTech account, via the Worker) for the posting fee, the developer membership, and the hire success fee
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

Fees and copy that quote money live in `apps/catalog/src/lib/pricing.ts`. Change them there. The browser must not tell the server an amount. A payment is marked paid only by the Worker, after the signature-checked confirm path or the signed webhook (`cloudflare/worker/src/payments.js`, `settlePayment`).

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
