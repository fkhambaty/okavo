# Deploying Okavo

**Live:** https://pro-catalog-nu.vercel.app
**Vercel project:** `pro-catalog` (root directory `apps/catalog`)
**Production Supabase:** `fzgnzaflvbimbiseqnrz`
**Staging Supabase:** a separate project (set via `SUPABASE_PROJECT_REF` / secrets)

The app is a static single-page build (Vite) talking directly to Supabase.
There is no server to run, so any static host works. Config for Vercel lives in
[vercel.json](../vercel.json); `apps/catalog/public/_redirects` covers Netlify
and Cloudflare Pages.

## Environments

| Layer | Production | Staging / Preview | Local |
|-------|------------|-------------------|-------|
| Site | `https://okavo.org` | Vercel Preview URL | `http://127.0.0.1:5180` |
| Supabase | `fzgnzaflvbimbiseqnrz` | dedicated staging project | `supabase start` (`config.toml`) |
| App env | Vercel Production `VITE_*` | Vercel Preview → **staging** keys | `apps/catalog/.env.local` |
| Seeds / RLS / smoke | **forbidden** (guarded) | `npm run seed:*` / `rls` / `smoke` | optional against local |

Copy [`scripts/env.example`](../scripts/env.example) → `.okavo-agent` and
[`apps/catalog/env.example`](../apps/catalog/env.example) →
`apps/catalog/.env.local`. Destructive seeds refuse the production project ref
unless `OKAVO_ALLOW_PRODUCTION_DESTRUCTIVE=1`. The RLS matrix refuses production
always. The agent console (`node scripts/okavo.mjs`) may still target production
for **read-only** inspection when no project ref is set.

### GitHub Actions secrets (optional staging job)

| Secret | Purpose |
|--------|---------|
| `STAGING_SUPABASE_URL` | Staging API URL |
| `STAGING_SUPABASE_PROJECT_REF` | Staging project ref |
| `STAGING_SUPABASE_ANON_KEY` | Staging anon key |
| `STAGING_SUPABASE_SERVICE_ROLE_KEY` | Staging service role |
| `SUPABASE_ACCESS_TOKEN` | Management API token (RLS SQL helpers) |

When those secrets are absent, CI still typechecks, lints, and builds; the
RLS/smoke job skips.

### Scheduled identity-retention sweep

[`.github/workflows/identity-sweep.yml`](../.github/workflows/identity-sweep.yml)
runs weekly (and on demand) to purge identity documents past their 90-day
deadline and to complete account-erasure requests. It calls the
`identity-retention-sweep` edge function, which is `verify_jwt = false` and
guards itself with a shared secret, so the job never handles a Supabase key.

| Secret | Purpose |
|--------|---------|
| `PROD_SUPABASE_URL` | Base URL of the project to sweep (e.g. `https://fzgnzaflvbimbiseqnrz.supabase.co`) |
| `IDENTITY_SWEEP_SECRET` | Must match the function's `IDENTITY_SWEEP_SECRET`; sent as the `x-okavo-notify` header |

When either secret is absent the workflow skips instead of failing.

### Scheduled Razorpay reconcile (report mode)

[`.github/workflows/razorpay-reconcile.yml`](../.github/workflows/razorpay-reconcile.yml)
runs daily and on demand. It calls `razorpay-reconcile` with
`RAZORPAY_RECONCILE_SECRET`. The function stays report-only unless
`ALLOW_PAYMENT_RECONCILIATION=true` is set on the Supabase function secrets.

| Secret | Purpose |
|--------|---------|
| `PROD_SUPABASE_URL` | Same production URL as the identity sweep |
| `RAZORPAY_RECONCILE_SECRET` | Must match the function secret (`x-okavo-notify`) |

## Hardening rollout (staging → production)

All Aug 2026 hardening work lands in-branch first. **Do not claim it live**
until the staging steps below pass.

1. **Provision staging Supabase** (separate project from `fzgnzaflvbimbiseqnrz`).
2. **Push migrations** `0001`–`0025` to staging, then production in bounded groups:
   - Group A: access / attestation / deliverables (`0021`)
   - Group B: exam hardening (`0022`)
   - Group C: payment ops + identity retention (`0023`, `0024`)
   - Group D: edge rate limits (`0025`)
3. **Deploy edge functions** to staging, then production
   (`razorpay-*`, `exam-analyze`, `requirement-assist`,
   `identity-retention-sweep`, `razorpay-reconcile`; Stripe stays disabled).
4. **Set secrets** (staging first):
   - GitHub: `STAGING_SUPABASE_*`, `PROD_SUPABASE_URL`,
     `IDENTITY_SWEEP_SECRET`, `RAZORPAY_RECONCILE_SECRET`
   - Vercel: `VITE_SUPABASE_*`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY` (auth throttle + analytics only — never
     expose to the browser bundle), `PUBLIC_SITE_URL`,
     `AUTH_ALLOWED_ORIGINS`, `ALLOWED_ORIGINS`, `RATE_LIMIT_SALT`
   - Supabase function secrets: Razorpay keys, reconcile/sweep secrets,
     `RATE_LIMIT_SALT`, optional `OPENAI_API_KEY`
5. **Auth allowlist:** add `/api/auth/callback` for production + preview URLs.
6. **Verify staging:**
   ```bash
   OKAVO_ENV=staging npm run seed:accounts
   OKAVO_ENV=staging npm run seed:test
   OKAVO_ENV=staging npm run rls
   OKAVO_ENV=staging npm run smoke
   ```
   Manually exercise: receptionist login/refresh/logout, exam submit/analyze,
   Razorpay test-mode order+confirm, attestation with proof, admin
   `/app/operations`, and a dry-run of the identity sweep.
7. **Production:** deploy the same groups, keep reconcile in report mode,
   enable the weekly identity sweep only after retention policy sign-off,
   and compare sensitive flows with `okavo.mjs db` vs `as`.

## 1. Create the database

The CLI on this machine is not authenticated, so this step needs your
credentials. Two options.

### Option A — SQL editor (no CLI, fastest)

1. Open the project → **SQL Editor** → **New query**
2. Paste all of [supabase/migrations/0001_schema.sql](../supabase/migrations/0001_schema.sql), run it
3. Create the auth users referenced by the seed (Authentication → Users), then
   paste [supabase/seed.sql](../supabase/seed.sql) and run it

Seeding is optional. The schema alone is enough to sign up and use the app.

### Option B — CLI

```bash
supabase login
supabase link --project-ref <staging-or-production-ref>
supabase db push
```

For local:

```bash
supabase start
supabase db reset   # migrations + seed.sql from config.toml
```

`db push` asks for the database password set when the project was created.

## 2. Auth settings

Authentication → Sign In / Providers:

- Turn **Confirm email** off while testing so new accounts can sign in
  immediately. Turn it back on before launch.

Authentication → URL Configuration, once deployed:

- **Site URL**: `https://okavo.org`
- **Redirect URLs**: `https://okavo.org/**`, `https://www.okavo.org/**`,
  `https://pro-catalog-nu.vercel.app/**`, plus local `http://127.0.0.1:5180/**`
  and your staging / preview hosts

Without this, sign-in links bounce to localhost.

### Custom SMTP (send auth mail from `support@okavo.org`)

Free-tier Supabase cannot change the From address or email templates until
custom SMTP is configured. In Auth → SMTP Settings use GoDaddy mailbox SMTP:

| Field | Value |
|-------|--------|
| Sender email | `support@okavo.org` |
| Sender name | `Okavo` |
| Host | `smtpout.secureserver.net` |
| Port | `465` (SSL) or `587` (TLS) |
| Username | `support@okavo.org` |
| Password | the mailbox password for `support@okavo.org` |

After SMTP is live, raise the email rate limit and brand the confirmation /
OTP templates to mention `support@okavo.org`.

## Payments (Razorpay is the live rail)

Money is never written by the browser. Amounts are decided in the edge
functions, and a payment is only marked paid by a signature-verified webhook via
the `settle_provider_payment` RPC (amount/currency/order must match; mismatches
are logged to `ops_events`). The `payments` table stays read-only for signed-in
users.

**Razorpay** is the only enabled provider. **Stripe is hard-disabled**: every
Stripe function refuses to run unless `PAYMENTS_PROVIDER=stripe` is explicitly
set, so the stubs cannot process money by accident.

Set these Supabase function secrets (production):

| Secret | Where it comes from |
|--------|---------------------|
| `RAZORPAY_KEY_ID` | Razorpay → Settings → API Keys |
| `RAZORPAY_KEY_SECRET` | Razorpay → Settings → API Keys |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay → Settings → Webhooks → signing secret |
| `RAZORPAY_RECONCILE_SECRET` | Any strong random string; sent as `x-okavo-notify` to `razorpay-reconcile` |
| `RAZORPAY_PAYMENTS_ENABLED` | Set to `true` only after the live domain and webhook have been verified |
| `SITE_URL` | `https://okavo.org` |
| `IDENTITY_SWEEP_SECRET` | Any strong random string; gate for `identity-retention-sweep` |
| `RATE_LIMIT_SALT` | Optional; salts hashed rate-limit buckets (defaults to `okavo-edge-v1`) |
| `OPENAI_API_KEY` | Optional; enables LLM assist/exam analysis (heuristics run without it) |

```bash
supabase secrets set --project-ref fzgnzaflvbimbiseqnrz \
  RAZORPAY_KEY_ID=rzp_... RAZORPAY_KEY_SECRET=... RAZORPAY_WEBHOOK_SECRET=... \
  RAZORPAY_RECONCILE_SECRET=... IDENTITY_SWEEP_SECRET=...
```

In Razorpay, add one webhook endpoint pointing at
`https://fzgnzaflvbimbiseqnrz.supabase.co/functions/v1/razorpay-webhook`.
`razorpay-reconcile` is read-only by default (reports drift); it only writes
settlements when invoked with `ALLOW_PAYMENT_RECONCILIATION=true`.

Before setting `RAZORPAY_PAYMENTS_ENABLED=true`, Razorpay Dashboard must show
`https://okavo.org` as approved under **Account & Settings → Business website
details**. Run one live ₹1/₹99 smoke payment and confirm that the payment is
`captured`, its webhook event is processed, and the matching Okavo payment row
is `paid`. Leave the flag unset or `false` while the domain is pending or after
any payment-integrity deployment mismatch; checkout then fails closed before an
order is created.

If the same Razorpay merchant also serves another business website, add Okavo
with **Add additional website/app**. Do not replace the approved primary
website: an approved edit replaces it and can stop that website's checkout.
After adding or changing any domain, leave payments disabled until Razorpay
shows every domain that must collect money as approved.

The production schema and edge functions must be deployed together. Apply
migrations `0021` through `0025` in filename order before deploying
`razorpay-order`, `razorpay-confirm`, `razorpay-webhook`, and
`razorpay-reconcile`. In particular, migration `0023_payment_ops.sql` creates
the provider IDs, webhook ledger, settlement RPC, and operations events used by
those functions. Deploying the functions first leaves captured payments unable
to reconcile.

Prices for platform fees live in `apps/catalog/src/lib/pricing.ts` (display) and
the Razorpay edge functions (charge in INR paise): ₹99 posting / ₹899 membership,
shown on the site as $1 / $11 until Stripe USD checkout is live.
Okavo collects the 10% hire success fee but does **not** hold build funds and
does **not** offer escrow — buyers pay developers directly against the locked
milestone schedule and attest each payment (with a private proof artifact).

### Auth receptionist (`/api/auth`)

Sessions no longer live in `localStorage`: the Vercel `/api/auth` functions keep
the refresh token in a rotating HttpOnly cookie and hand the browser a
memory-only access token. Set these on the Vercel project (Production + Preview):

| Name | Value |
|------|-------|
| `SUPABASE_URL` | project API URL (staging URL for Preview) |
| `SUPABASE_ANON_KEY` | project anon key (staging for Preview) |
| `PUBLIC_SITE_URL` | `https://okavo.org` (Preview → its URL) |
| `AUTH_ALLOWED_ORIGINS` | optional extra origins for cookie mutations |

Add `https://okavo.org/api/auth/callback` (plus preview URLs) to the Supabase
Auth redirect allowlist, or PKCE sign-in bounces.

## 3. Storage buckets

Create three **private** buckets: `identity-documents`,
`interview-recordings`, `deliverables`. Local `supabase start` creates them from
[`supabase/config.toml`](../supabase/config.toml).

## 4. Deploy

### Vercel (recommended)

1. Push the repo to GitHub
2. Vercel → Add New → Project → import the repo
3. Leave the root directory as the repository root — `vercel.json` already sets
   the build command and output directory
4. Add environment variables:

   | Name | Production | Preview |
   |------|------------|---------|
   | `VITE_SUPABASE_URL` | production URL | **staging** URL |
   | `VITE_SUPABASE_ANON_KEY` | production anon | **staging** anon |
   | `SUPABASE_URL` | production URL (auth + collect) | **staging** URL |
   | `SUPABASE_ANON_KEY` | production anon | **staging** anon |
   | `SUPABASE_SERVICE_ROLE_KEY` | production service role (server-only: auth rate limits + analytics) | **staging** service role |
   | `PUBLIC_SITE_URL` | `https://okavo.org` | preview URL |
   | `AUTH_ALLOWED_ORIGINS` | optional extras | optional extras |
   | `ALLOWED_ORIGINS` | optional extras for `/api/collect` | optional extras |
   | `RATE_LIMIT_SALT` | shared with edge functions | shared with staging edges |

5. Deploy, then add the resulting URL to Supabase Auth URL Configuration

`.env.local` is gitignored, so the variables must be set in the dashboard.

### Cloudflare Pages

Build command `npm run build`, output directory `apps/catalog/dist`, same two
environment variables. `_redirects` handles client-side routing.

## Why the anon key is safe in the browser

`VITE_` variables are compiled into the bundle and visible to anyone. The anon
key is designed for that — every table has row level security, so the key alone
grants nothing. The **service role key must never** appear in this app; it
belongs only in server-side code.

## Custom domain (`okavo.org`)

Domains are already attached on Vercel (`okavo.org` + `www.okavo.org` → apex).
On GoDaddy DNS Records set:

| Type | Name | Value | TTL |
|------|------|--------|-----|
| A | `@` | `216.198.79.1` | 1 Hour |
| A | `@` | `64.29.17.1` | 1 Hour |
| CNAME | `www` | `cname.vercel-dns.com` | 1 Hour |

Remove any old `@` A/AAAA or parking records that conflict. After DNS
propagates, `https://okavo.org` serves the site.
