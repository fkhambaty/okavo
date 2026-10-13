# Okavo

**Commission software anywhere, on a locked agreement.**

Okavo connects people who need software with verified AI developers who build
it. Buyers describe an outcome in plain language, Okavo turns it into a signed
agreement, and only then do developers bid — all against identical, frozen
scope. What the buyer approved is what gets delivered.

Buyers range from a two-counter bakery to a Fortune 500 insurer. Developers
verify their identity, pass a timed build exam, and pay a one-time **$11 membership** to unlock bidding.

## Run it

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5180. Without `VITE_OKAVO_API_URL` the workspace uses the
in-browser demo. Production calls the Cloudflare Worker and D1. Supabase is not
the live database.

| Command | Does |
|---------|------|
| `npm run dev` | Start the marketplace on port 5180 |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Serve the production build |

## Two points of view

Sign in at `/signin` and pick a role. The workspace changes completely.

### Buyer

| Route | Purpose |
|-------|---------|
| `/app` | Overview: requirements, bids, monthly commitments |
| `/app/new` | Five-step guided intake in plain language |
| `/app/project/:id` | Requirement, lock signature, incoming bids, hire |
| `/app/contract/:id` | The contract: scope, milestones, change orders |
| `/app/contracts` | Every contract and its stage |
| `/app/payments` | Milestone ledger. Payments recorded here are attestations, not escrow |
| `/app/messages` | Conversations with developers |

### Developer

| Route | Purpose |
|-------|---------|
| `/app` | Project board with filters |
| `/app/project/:id` | Locked contract plus the bid form |
| `/app/bids` | Bid pipeline and outcomes |
| `/app/contract/:id` | Submit milestones, raise change orders |
| `/app/earnings` | Accepted milestones, in progress, retainers |
| `/app/verification` | Identity, build interview, **$11 membership** |

## The lifecycle

```
describe → review scope → sign lock → bids open → hire
   → confirm paid outside Okavo → submit milestone → accept against scope
   → change orders / disputes → review → close
```

Buyers pay developers directly against the locked milestone schedule, then record
that payment in Okavo. That record is an attestation. Okavo does not hold the
money in escrow.

Every stage is clickable in the demo.

## Fees — both sides have skin in the game

| Who | Fee | When |
|-----|-----|------|
| Buyer | **$1** | Per requirement, charged at creation (Razorpay collects INR equivalent until Stripe USD) |
| Developer | **$11** | One time, unlocks bidding (Razorpay collects INR equivalent until Stripe USD) |

Browsing is free on both sides. Acting is not. Each fee is enforced twice:

**Buyer posting fee.** The wizard takes payment on the final step. In the
database, `enforce_posting_fee()` runs before every insert on `projects`, looks
for a paid and unconsumed `requirement_posting` payment, and marks it consumed —
so one fee posts exactly one requirement and cannot be replayed.

**Developer bidding membership.** The bid form is disabled and points to
`/app/verification`. In the database, `enforce_bid_eligibility()` rejects any bid
from a developer without `bidding_unlocked_at` set.

Both live in Postgres rather than only in the interface, so a direct API call
fails the same way the UI does. Swap the demo checkouts for Stripe before launch.

## Supabase

Schema, policies, triggers and seed data live in [supabase/](supabase/). See
[supabase/README.md](supabase/README.md) for setup.

Sign-in uses Supabase Auth (email and password). The role chosen at sign-up is
stored in user metadata, and the `profiles` plus `buyer_profiles` or
`developer_profiles` rows are created on first authenticated load. When the
environment variables are missing, the app falls back to demo data and a role
picker, so a fresh clone still runs.

```bash
cp apps/catalog/.env.example apps/catalog/.env.local
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

## Brand

| Token | Value |
|-------|-------|
| Ink | `#0C0D10` |
| Paper | `#FBFAF7` |
| Accent (amber) | `#E8973A` |
| Lock (emerald) | `#1B7A5A` |
| Display type | Archivo |
| Body type | Inter |

The mark is an aperture closed by a bar — the requirement lock.

**Name clearance is still outstanding.** A web search is not a trademark
search. Before any public launch, commission a formal clearance in India, the
US and the EU covering Nice Class 42 (software) and Class 35 (marketplace
services).

## Repository layout

| Path | Contents |
|------|----------|
| `apps/catalog/` | The marketplace application |
| `supabase/` | Migrations, seed data, setup guide |
| `docs/` | Architecture notes |
| `ops/`, `apps/demo-growth/` | Earlier vertical-studio prototype, not part of the build |

## Before going live

- Prove Razorpay posting and membership fees end to end; switch on Okavo-held escrow when payout rails are ready
- Move identity documents and interview recordings into private storage buckets
- Add an admin surface for verification review and dispute resolution
- Complete trademark clearance for the Okavo name
