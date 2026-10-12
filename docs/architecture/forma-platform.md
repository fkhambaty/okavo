# FORMA — older product thesis, not the running system

The live product is **Okavo** (https://okavo.org). This file keeps the earlier FORMA thesis. For how the code, database, payments, and deploy actually work, read `ARCHITECTURE.md` at the repo root and `AGENTS.md`. Do not rename the running app back to FORMA, and do not treat the eight-domain model below as the current schema.

# FORMA — End-to-End Platform Architecture

**Working name:** FORMA  
**Promise:** Pick · Approve · Live · Care  
**Law:** Less is more. Catalog, not freelancers. Canon before code. Care after launch.

This document is the durable companion to the interactive architecture canvas.

---

## 1. North star

FORMA is the **operating layer for outcome-based business software**.

- The owner buys an **outcome** (a working business system under care).
- The **Canon** (locked screens + acceptance criteria) is the contract spine.
- AI-native builders are **supply infrastructure**, never the public product.
- **Runtime + Care** turn a delivery studio into infrastructure — the only credible path toward civilization-scale value.

### Trillion-class honesty

A freelance marketplace take-rate business is **not** multi-trillion.

Multi-trillion is only in play if FORMA eventually owns:

1. Demand brand (how owners start)
2. Canon standards (how scope is frozen)
3. Certified delivery network (how software is produced)
4. Runtime plane (where systems run)
5. Care fleet (how systems stay alive)
6. Later: protocol / agents (how software continuously evolves)

Without (4) and (5), FORMA is a strong services company — valuable, not infrastructure-scale.

---

## 2. Design laws (upmarket, mass market)

1. **One promise** on the homepage — never “hire developers.”
2. **Finite SKUs** per vertical — never “build anything.”
3. **Human-reviewed Canon** — AI drafts; humans lock.
4. **Owner UI hides machinery** — no git, résumés, bids, stacks.
5. **Care is the brand** — the phone that answers is the moat.
6. **Portability** — customer can export; anti–Builder.ai lock-in trap.
7. **Earn phases** — marketplace and protocol only after Care density.

---

## 3. Domain architecture (eight only)

| Domain | Responsibility |
|--------|----------------|
| **Catalog** | Verticals, SKUs, exclusions, price X / monthly Y |
| **Briefing** | Discovery capture; AI-assisted draft |
| **Canon** | Versioned screens, flows, acceptance checklist, signature |
| **Ledger** | Deposits, milestones, change orders, invoices (Okavo-held escrow when live) |
| **Delivery** | Assignment, builder workbench, evidence, reassignment |
| **Trust** | Work-sample certification, tiers, identity/KYC by corridor |
| **Runtime** | Per-customer app/DB/deploy/backups/domains/secrets |
| **Care** | SLA, health, patches, support queue, retainers |

**Non-domains (year 1):** public profiles, bidding, LeetCode, global KYC, social feed, infinite custom briefs.

### Canon as spine

```
Briefing draft → Human review → Canon vN signed
     ↓
Delivery milestones judged against Canon
     ↓
Acceptance walkthrough = checklist pass
     ↓
Warranty / change orders reference Canon delta
```

If it is not in Canon, it is not owed.

---

## 4. Experience architecture

| Surface | Audience | Verbs |
|---------|----------|-------|
| Owner | Layman business owner | Choose, Approve, Pay, Message |
| Operator | FORMA staff | Qualify, Lock, Assign, Resolve |
| Builder | Certified supply | Accept, Ship, Evidence, Fix |
| Partner | CA / channel | Refer, Track, Earn |

**Owner journey (ritual):** Choose → Brief → Lock → Build → Accept → Care

---

## 5. Technical architecture

### Posture

- **Modular monolith** for control plane (P0–P1).
- Extract services only for compliance isolation or independent scale (Runtime, payments webhooks, media).
- **Event outbox** between domains — no spaghetti shared tables across bounded contexts.

### Control plane

- TypeScript web app + API + RBAC
- Postgres (system of record)
- Object storage (Canon artifacts, recordings, evidence)
- Razorpay/Stripe milestone payments
- WhatsApp Business + email for owner comms

### Data plane (Runtime)

- Per-customer deployment from **SKU templates**
- Observability, SSL, backups automated under Care
- Secrets vault; optional customer-owned domain
- Documented export path

### Trust (internal)

- Timed work-sample (Funberry-class), screen recorded
- Tiers: Associate · Builder · Principal (no fake 94/91 scores on Owner UI)
- KYC when payouts scale, corridor by corridor

### AI placement

| Allowed | Forbidden |
|---------|-----------|
| Briefing drafts | Sole authority on Canon freeze |
| Operator assist | Owner-facing “AI builds your app” as headline |
| Care alerts / PR hygiene | Unlimited scope generation |

---

## 6. Scale phases

| Phase | Form | Money | Brand |
|-------|------|-------|-------|
| P0 Studio | 1 vertical, 3 SKUs, manual | X + Y | Metro niche |
| P1 Product | Operator + Runtime + Trust | Template margin + MRR | City noun |
| P2 Network | Multi-vertical, partners, cities | Volume + Care fleet | National vertical brands |
| P3 Marketplace | Open certified supply, brand-led assign | Take rate + Care + Runtime | Category default |
| P4 Protocol | APIs, agents, enterprise rails | Infrastructure usage | Global software delivery rails |

---

## 7. Mass-market distribution

1. Direct WhatsApp / web (proof)
2. CA / association partners (trust transfer)
3. Vertical adjacency (where SaaS is rigid)
4. City density before national ads
5. Become the **vertical noun** (“lagao FORMA”) — not “Zomato of software”

---

## 8. Self-scrutiny (sign-off)

**Approved because:**

- P0 earns without two-sided liquidity
- Mass UX is a catalog, not hiring
- Canon attacks expectation mismatch
- Care creates habit and LTV
- Runtime prevents agency death / disintermediation
- Marketplace is earned, not launched empty

**Rejected:**

- Day-one open AI-developer marketplace
- Unsupervised AI auto-lock
- Public precision scoreboards
- Global KYC before corridor proof
- Infinite “build anything” SKU

---

## 9. Immediate build order (when executing)

1. Catalog + pricing sheet (no code)
2. Canon template (Figma → freeze checklist)
3. Ledger via Razorpay milestones (manual OK)
4. Care WhatsApp SLA
5. Operator spreadsheet → then Operator console
6. Runtime templates for the first SKU family
7. Trust work-sample only when bench must grow
8. Marketplace last
