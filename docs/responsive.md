# Responsive audit

Okavo is checked at phone, tablet, and desktop sizes before a layout change is called done. The script is `scripts/responsive-audit.mjs`. `node scripts/okavo.mjs responsive` runs the same file.

## Viewports

| Name | Size | Why |
|------|------|-----|
| 390x667 | iPhone SE | Short phone |
| 390x844 | iPhone 14 | Common phone |
| 393x852 | iPhone 16 | Current phone |
| 768x1024 | iPad portrait | Small tablet |
| 820x1180 | iPad Air portrait | Larger tablet |
| 1024x768 | iPad landscape | Tablet with the desktop shell |
| 1440x900 | Laptop | Desktop |
| 390x667-landscape | 667x390 | Orientation pair of the short phone |

The landscape pass covers marketing, sign-in, recovery, verification, and the dense workspace screens (home, wizard, contracts, messages, payments return, developer verification, admin exams). The seven named sizes cover every route in the matrix.

## Roles

| Role | How the audit signs in | What it must keep |
|------|------------------------|-------------------|
| guest | No session | Marketing pages, sign-in, create-account, `?recovery=1`, `?verify=1` |
| buyer | Form login `dummy` / `dummy`, then the same demo session | `Principal · lifetime`, `Demo data`, publish copy says no charge |
| developer | Fixture session `Fixture Developer` | Upload field, exam URL fields, membership says no charge. Not the dummy buyer |
| admin | Fixture session `Fixture Admin` | Admin routes render. No payment call |

`?verify=1` only shows the confirmation-code field. It does not send mail and it does not confirm an account. Recovery `?recovery=1` only shows the new-password form.

The hosted checkout return is `/app/payments/return` and the same path with an unsigned `cancelled` payment-link query. The audit does not create a Razorpay payment link and fails if any request hits Razorpay or a payment write.

Screenshots of the first paint (before the loading screen clears) are written to `tmp/responsive/`, which is gitignored.

## Run

```bash
VITE_OKAVO_API_URL=https://okavo-api.fkhambaty.workers.dev npm run build
npm run responsive
```

The Worker URL has to be present at build time. That is the same public URL Vercel bakes into production. Without it, sign-in is the offline demo and the audit cannot see the email form.

`npm run responsive -- --base http://127.0.0.1:5180` uses a server you already started instead of `vite preview`.
