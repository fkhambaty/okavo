#!/usr/bin/env node
/**
 * Fills a non-production database with believable test data: dummy developers
 * and buyers, requirements at every stage, bids, contracts and milestones.
 *
 * Safe to re-run: it deletes the rows it previously created (identified by the
 * @okavo.test email domain) before inserting again. It never touches the real
 * accounts beyond making them usable for testing.
 *
 * Refuses production unless OKAVO_ALLOW_PRODUCTION_DESTRUCTIVE=1.
 * Point SUPABASE_PROJECT_REF / SUPABASE_URL at staging.
 *
 *   node scripts/seed-test-data.mjs
 */

import {
  assertSafeForDestructiveSeed,
  fail,
  managementSql,
  requireAccessToken,
  resolveTarget,
} from "./lib/okavo-env.mjs";

console.error(
  "seed:test is retired. It used to insert sample buyers, developers, and requirements into Supabase. Do not invent that activity. Post a real requirement yourself. See docs/FOUNDER_SEEDING.md.",
);
process.exit(1);

const target = resolveTarget();
assertSafeForDestructiveSeed(target);

const { projectRef: PROJECT_REF, supabaseUrl: SUPABASE_URL } = target;
const TEST_PASSWORD = "123456789";

async function sql(query) {
  return managementSql(target, query);
}

async function serviceRoleKey() {
  if (target.serviceRoleKey) return target.serviceRoleKey;

  const token = requireAccessToken(target);
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const keys = await response.json();
  const key = keys.find((k) => k.name === "service_role");
  if (!key) fail("service_role key not found (set SUPABASE_SERVICE_ROLE_KEY)");
  return key.api_key;
}

/** Creates an auth user, reusing the existing one if the email is taken. */
async function ensureAuthUser(serviceKey, email, metadata) {
  const create = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: metadata,
    }),
  });

  if (create.ok) return (await create.json()).id;

  const lookup = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  const found = (await lookup.json()).users?.[0];
  if (!found) throw new Error(`Could not create or find ${email}`);
  return found.id;
}

const DEVELOPERS = [
  {
    email: "maya.chen@okavo.test",
    name: "Maya Chen",
    country: "SG",
    tier: "principal",
    rate: 68,
    headline: "End-to-end product engineer, payments and auth",
    delivered: 38,
    firstPass: 94,
  },
  {
    email: "arjun.mehta@okavo.test",
    name: "Arjun Mehta",
    country: "IN",
    tier: "verified",
    rate: 44,
    headline: "Ships locked scopes in two to four weeks",
    delivered: 27,
    firstPass: 88,
  },
  {
    email: "sofia.alvarez@okavo.test",
    name: "Sofia Alvarez",
    country: "ES",
    tier: "principal",
    rate: 72,
    headline: "AI features that survive production",
    delivered: 19,
    firstPass: 91,
  },
  {
    email: "noah.okonkwo@okavo.test",
    name: "Noah Okonkwo",
    country: "NG",
    tier: "verified",
    rate: 51,
    headline: "Pixel-faithful builds from approved screens",
    delivered: 41,
    firstPass: 86,
  },
  {
    email: "lena.fischer@okavo.test",
    name: "Lena Fischer",
    country: "DE",
    tier: "principal",
    rate: 79,
    headline: "Data-heavy internal tools and dashboards",
    delivered: 23,
    firstPass: 93,
  },
];

const BUYERS = [
  {
    email: "priya.raman@okavo.test",
    name: "Priya Raman",
    org: "Northline Labs",
    scale: "startup",
    country: "US",
  },
  {
    email: "tom.reyes@okavo.test",
    name: "Tom Reyes",
    org: "Rose Street Bakery",
    scale: "local_business",
    country: "GB",
  },
  {
    email: "anika.rao@okavo.test",
    name: "Dr Anika Rao",
    org: "Meridian Clinic",
    scale: "smb",
    country: "KE",
  },
];

const q = (value) =>
  value === null || value === undefined
    ? "null"
    : `'${String(value).replace(/'/g, "''")}'`;

async function main() {
  console.log(`Seeding project ${PROJECT_REF} (${target.envName})…`);
  const serviceKey = await serviceRoleKey();

  console.log("Resolving the real accounts…");
  const accounts = await sql(
    `select u.id, u.email from auth.users u
     where u.email in ('fk_qrf@yahoo.com','fktiindia@gmail.com')`
  );
  const buyerSelf = accounts.find((a) => a.email === "fk_qrf@yahoo.com")?.id;
  const devSelf = accounts.find((a) => a.email === "fktiindia@gmail.com")?.id;
  if (!buyerSelf || !devSelf) {
    throw new Error("Your buyer or developer account is missing");
  }

  console.log("Removing any previous seeded data…");
  // Seeded requirements are identified by their buyer, not by a marker in the
  // title, so the marketplace reads like the real thing.
  await sql(`
    delete from projects p
      using buyer_profiles bp, profiles pr
      where p.buyer_id = bp.profile_id
        and pr.id = bp.profile_id
        and pr.email like '%@okavo.test';

    delete from projects where title like '[test]%';

    delete from projects p
      using payments pay
      where pay.project_id = p.id and pay.provider = 'seed';

    delete from auth.users where email like '%@okavo.test';
  `);

  console.log("Creating dummy developers and buyers…");
  const devIds = {};
  for (const dev of DEVELOPERS) {
    devIds[dev.email] = await ensureAuthUser(serviceKey, dev.email, {
      role: "developer",
      full_name: dev.name,
    });
  }
  const buyerIds = {};
  for (const buyer of BUYERS) {
    buyerIds[buyer.email] = await ensureAuthUser(serviceKey, buyer.email, {
      role: "buyer",
      full_name: buyer.name,
      organization_name: buyer.org,
    });
  }

  console.log("Writing profiles…");
  const profileRows = [
    ...DEVELOPERS.map(
      (d) =>
        `(${q(devIds[d.email])}, 'developer', ${q(d.name)}, ${q(d.email)}, ${q(d.country)})`
    ),
    ...BUYERS.map(
      (b) =>
        `(${q(buyerIds[b.email])}, 'buyer', ${q(b.name)}, ${q(b.email)}, ${q(b.country)})`
    ),
  ].join(",\n      ");

  await sql(`
    insert into profiles (id, role, full_name, email, country_code)
    values
      ${profileRows}
    on conflict (id) do update
      set role = excluded.role,
          full_name = excluded.full_name,
          country_code = excluded.country_code;

    insert into developer_profiles
      (profile_id, headline, hourly_rate_usd, tier, identity_status,
       interview_status, bidding_unlocked_at, contracts_delivered, first_pass_acceptance)
    values
      ${DEVELOPERS.map(
        (d) =>
          `(${q(devIds[d.email])}, ${q(d.headline)}, ${d.rate}, ${q(d.tier)}, 'approved', 'approved', now() - interval '60 days', ${d.delivered}, ${d.firstPass})`
      ).join(",\n      ")}
    on conflict (profile_id) do update
      set headline = excluded.headline,
          tier = excluded.tier,
          identity_status = 'approved',
          interview_status = 'approved',
          bidding_unlocked_at = excluded.bidding_unlocked_at,
          contracts_delivered = excluded.contracts_delivered,
          first_pass_acceptance = excluded.first_pass_acceptance;

    insert into buyer_profiles (profile_id, organization_name, scale)
    values
      ${BUYERS.map(
        (b) => `(${q(buyerIds[b.email])}, ${q(b.org)}, ${q(b.scale)})`
      ).join(",\n      ")}
    on conflict (profile_id) do update
      set organization_name = excluded.organization_name,
          scale = excluded.scale;
  `);

  console.log("Making your own accounts test-ready…");
  await sql(`
    insert into buyer_profiles (profile_id, organization_name, scale)
    values (${q(buyerSelf)}, 'Khambaty Ventures', 'smb')
    on conflict (profile_id) do nothing;

    insert into developer_profiles
      (profile_id, headline, hourly_rate_usd, tier, identity_status,
       interview_status, bidding_unlocked_at, contracts_delivered, first_pass_acceptance)
    values (${q(devSelf)}, 'Full-stack engineer, end-to-end delivery', 55,
            'verified', 'approved', 'approved', now() - interval '20 days', 6, 90)
    on conflict (profile_id) do update
      set identity_status = 'approved',
          interview_status = 'approved',
          tier = 'verified',
          hourly_rate_usd = 55,
          headline = 'Full-stack engineer, end-to-end delivery',
          bidding_unlocked_at = coalesce(developer_profiles.bidding_unlocked_at, now());

    insert into interview_assessments
      (developer_id, status, brief_slug, score_security, score_efficiency,
       score_maintainability, score_recovery, score_overall, reviewed_at)
    select ${q(devSelf)}, 'approved', 'end-to-end-build', 88, 84, 91, 79, 86, now()
    where not exists (
      select 1 from interview_assessments where developer_id = ${q(devSelf)}
    );
  `);

  // ---------------------------------------------------------------------
  // Requirements. Each insert consumes one paid posting fee, so a matching
  // payment is created immediately before it.
  // ---------------------------------------------------------------------

  const projects = [
    {
      key: "draft",
      buyer: buyerSelf,
      title: "Bakery ordering and pickup",
      category: "Sell online",
      outcome:
        "Customers order cakes online, choose a pickup time, and pay. I see today's orders on one screen.",
      min: 300000,
      max: 600000,
      monthly: 12000,
      weeks: 6,
      stage: "drafting",
      scope: [
        ["Works on phones", "Ordering works on a phone browser."],
        ["Take payments", "Card payment at checkout."],
        ["Admin dashboard", "One screen showing today's orders."],
      ],
    },
    {
      key: "openBids",
      buyer: buyerSelf,
      title: "Customer portal with subscription billing",
      category: "Customer portal",
      outcome:
        "Our customers log in, see their invoices, update payment methods, and download usage reports without emailing support.",
      min: 900000,
      max: 1400000,
      monthly: 24000,
      weeks: 7,
      stage: "locked",
      scope: [
        ["Customer logins", "Email sign-in, password reset, profile."],
        ["Reports and exports", "Usage report download as CSV."],
        ["Take payments", "Update card on file."],
      ],
    },
    {
      key: "inDelivery",
      buyer: buyerSelf,
      title: "Field service scheduling tool",
      category: "Replace spreadsheets",
      outcome:
        "My team stops sharing spreadsheets. Jobs are assigned, engineers update status from the field, and I see what is overdue.",
      min: 700000,
      max: 1100000,
      monthly: 18000,
      weeks: 8,
      stage: "in_delivery",
      award: "maya.chen@okavo.test",
      scope: [
        ["Admin dashboard", "Assign and track jobs."],
        ["Works on phones", "Engineers update jobs on a phone."],
        ["Email or WhatsApp alerts", "Engineer gets a job alert."],
      ],
    },
    {
      key: "clinic",
      buyer: buyerIds["anika.rao@okavo.test"],
      title: "Clinic appointment booking",
      category: "Take bookings",
      outcome:
        "Patients choose a doctor, pick a slot, and pay the consult fee upfront. Reception stops double-booking.",
      min: 400000,
      max: 750000,
      monthly: 15000,
      weeks: 6,
      stage: "locked",
      scope: [
        ["Works on phones", "Booking works on a phone."],
        ["Take payments", "Consult fee paid at booking."],
        ["Email or WhatsApp alerts", "Reminder before the appointment."],
      ],
    },
    {
      key: "bakery2",
      buyer: buyerIds["tom.reyes@okavo.test"],
      title: "Two-location bakery ordering",
      category: "Sell online",
      outcome:
        "Both shops share one menu but keep separate stock counts, and customers pick which shop to collect from.",
      min: 250000,
      max: 500000,
      monthly: 9000,
      weeks: 5,
      stage: "locked",
      scope: [
        ["Multiple locations", "Each shop has its own stock."],
        ["Take payments", "Pay online before collection."],
      ],
    },
    {
      key: "warehouse",
      buyer: buyerIds["priya.raman@okavo.test"],
      title: "Warehouse stock dashboard",
      category: "Replace spreadsheets",
      outcome:
        "Managers see live stock across three warehouses and export a weekly report without asking the data team.",
      min: 600000,
      max: 950000,
      monthly: 20000,
      weeks: 6,
      stage: "locked",
      scope: [
        ["Admin dashboard", "Live stock by warehouse."],
        ["Reports and exports", "Weekly CSV export."],
        ["Single sign-on", "Staff sign in with company accounts."],
      ],
    },
    {
      key: "renewals",
      buyer: buyerIds["anika.rao@okavo.test"],
      title: "Membership renewals portal",
      category: "Customer portal",
      outcome:
        "Members renew online, download receipts, and update their details without calling the front desk.",
      min: 350000,
      max: 650000,
      monthly: 11000,
      weeks: 5,
      stage: "locked",
      scope: [
        ["Customer logins", "Members manage their own account."],
        ["Take payments", "Renewal paid by card."],
      ],
    },
    {
      key: "assistant",
      buyer: buyerIds["priya.raman@okavo.test"],
      title: "AI support assistant over our docs",
      category: "Add an AI feature",
      outcome:
        "Visitors ask questions in plain language and get answers from our documentation only, with a link to the source.",
      min: 800000,
      max: 1300000,
      monthly: 30000,
      weeks: 7,
      stage: "locked",
      scope: [
        ["Customer logins", "Only signed-in customers can ask."],
        ["Admin dashboard", "See what people asked."],
        ["Data stays in my region", "No data leaves the region."],
      ],
    },
    {
      key: "mine",
      buyer: buyerIds["priya.raman@okavo.test"],
      title: "Invoice reconciliation tool",
      category: "Replace spreadsheets",
      outcome:
        "Finance matches supplier invoices against purchase orders automatically and only reviews the exceptions.",
      min: 750000,
      max: 1200000,
      monthly: 22000,
      weeks: 8,
      stage: "in_delivery",
      awardSelf: true,
      scope: [
        ["Admin dashboard", "Exception queue for finance."],
        ["Reports and exports", "Monthly reconciliation export."],
      ],
    },
  ];

  console.log("Creating requirements…");
  const projectIds = {};
  for (const project of projects) {
    await sql(`
      insert into payments (profile_id, purpose, status, amount_cents, provider, paid_at)
      values (${q(project.buyer)}, 'requirement_posting', 'paid', 100, 'seed', now());
    `);

    const rows = await sql(`
      insert into projects
        (buyer_id, title, category, outcome_statement, stage,
         budget_min_cents, budget_max_cents, monthly_run_cents, timeline_weeks, published_at)
      values (${q(project.buyer)}, ${q(project.title)}, ${q(project.category)},
              ${q(project.outcome)}, 'drafting', ${project.min}, ${project.max},
              ${project.monthly}, ${project.weeks},
              now() - interval '${Math.floor(Math.random() * 6) + 1} days')
      returning id;
    `);
    const projectId = rows[0].id;
    projectIds[project.key] = projectId;

    const scopeValues = project.scope
      .map(
        ([label, detail], index) =>
          `(${q(projectId)}, ${q(label)}, ${q(detail)}, true, ${q(
            `Accepted when ${label.toLowerCase()} works end to end.`
          )}, ${index})`
      )
      .join(",\n        ");

    await sql(`
      insert into scope_items (project_id, label, detail, included, acceptance_criteria, position)
      values
        ${scopeValues};
    `);

    // Everything except the draft gets a locked contract, which is what makes
    // it visible on the developer board and open for bids.
    if (project.stage !== "drafting") {
      await sql(`
        insert into contracts
          (project_id, buyer_id, lock_reference, status, agreed_monthly_cents, agreed_weeks)
        values (${q(projectId)}, ${q(project.buyer)},
                'LOCK-' || upper(substr(md5(random()::text), 1, 6)),
                'draft', ${project.monthly}, ${project.weeks});

        update contracts
          set status = 'locked', locked_at = now(), buyer_signed_at = now()
          where project_id = ${q(projectId)};

        update projects set stage = 'locked' where id = ${q(projectId)};
      `);
    }
  }

  // ---------------------------------------------------------------------
  // Bids. The project must still be 'locked' at this point, which is why the
  // hired projects are advanced only afterwards.
  // ---------------------------------------------------------------------

  console.log("Placing bids…");
  const bids = [
    ["openBids", "maya.chen@okavo.test", 1180000, 22000, 7, "I have shipped this exact billing portal twice. Invoices pull straight from the payment provider so the numbers always reconcile."],
    ["openBids", "arjun.mehta@okavo.test", 960000, 20000, 6, "Fixed price against the locked scope. Weekly demo every Friday so nothing drifts."],
    ["openBids", "noah.okonkwo@okavo.test", 1050000, 24000, 8, "Includes a design pass on the portal screens before any code is written."],
    ["openBids", "lena.fischer@okavo.test", 1320000, 26000, 7, "Usage reporting is where these projects usually fail. I build that first, not last."],
    ["clinic", "arjun.mehta@okavo.test", 520000, 14000, 5, "Booking plus reminders, live in five weeks."],
    ["clinic", "noah.okonkwo@okavo.test", 610000, 15000, 6, "Reception-friendly interface, tested with non-technical staff."],
    ["bakery2", "noah.okonkwo@okavo.test", 380000, 9000, 5, "Two shops, one menu, separate stock. Straightforward and I have done it before."],
    ["warehouse", "lena.fischer@okavo.test", 880000, 19000, 6, "Live dashboards over three sites, with the weekly export scheduled."],
    ["warehouse", "maya.chen@okavo.test", 790000, 20000, 6, "Single sign-on included so your staff do not manage another password."],
    ["warehouse", "sofia.alvarez@okavo.test", 920000, 21000, 7, "Includes anomaly alerts when a warehouse count looks wrong."],
    ["assistant", "sofia.alvarez@okavo.test", 1150000, 29000, 7, "Answers cite the source document, and the model never sees data outside your region."],
    ["assistant", "maya.chen@okavo.test", 1240000, 30000, 8, "Retrieval over your docs only, with an admin view of every question asked."],
    ["inDelivery", "maya.chen@okavo.test", 980000, 18000, 8, "Field-first: engineers can update a job in three taps."],
  ];

  for (const [key, email, amount, monthly, weeks, message] of bids) {
    await sql(`
      insert into bids
        (project_id, developer_id, status, amount_cents, monthly_run_cents,
         delivery_weeks, message, accepts_locked_scope, created_at)
      values (${q(projectIds[key])}, ${q(devIds[email])}, 'submitted', ${amount},
              ${monthly}, ${weeks}, ${q(message)}, true,
              now() - interval '${Math.floor(Math.random() * 4) + 1} days');
    `);
  }

  // Your developer account wins one contract, so Earnings has real numbers.
  await sql(`
    insert into bids
      (project_id, developer_id, status, amount_cents, monthly_run_cents,
       delivery_weeks, message, accepts_locked_scope, created_at)
    values (${q(projectIds.mine)}, ${q(devSelf)}, 'awarded', 890000, 22000, 8,
            'Exception-first design: finance only looks at what did not match.',
            true, now() - interval '9 days');
  `);

  console.log("Awarding two contracts and creating milestones…");

  // Project the buyer hired Maya for.
  await sql(`
    update bids set status = 'awarded'
      where project_id = ${q(projectIds.inDelivery)}
        and developer_id = ${q(devIds["maya.chen@okavo.test"])};

    update contracts
      set developer_id = ${q(devIds["maya.chen@okavo.test"])},
          status = 'active',
          agreed_amount_cents = 980000,
          developer_signed_at = now() - interval '6 days'
      where project_id = ${q(projectIds.inDelivery)};

    update projects set stage = 'in_delivery' where id = ${q(projectIds.inDelivery)};

    insert into milestones (contract_id, title, description, amount_cents, position, status, due_on, funded_at, submitted_at, accepted_at, released_at)
    select c.id, 'Foundations and job model', 'Data model, sign-in, and the job list.', 294000, 0, 'released', current_date - 3, now() - interval '6 days', now() - interval '4 days', now() - interval '3 days', now() - interval '3 days'
      from contracts c where c.project_id = ${q(projectIds.inDelivery)};

    insert into milestones (contract_id, title, description, amount_cents, position, status, due_on, funded_at, submitted_at)
    select c.id, 'Field updates on mobile', 'Engineers update job status from a phone.', 392000, 1, 'submitted', current_date + 5, now() - interval '2 days', now() - interval '1 day'
      from contracts c where c.project_id = ${q(projectIds.inDelivery)};

    insert into milestones (contract_id, title, description, amount_cents, position, status, due_on)
    select c.id, 'Alerts and handover', 'Job alerts, documentation and deployment.', 294000, 2, 'pending', current_date + 18
      from contracts c where c.project_id = ${q(projectIds.inDelivery)};
  `);

  // Project your developer account is delivering.
  await sql(`
    update contracts
      set developer_id = ${q(devSelf)},
          status = 'active',
          agreed_amount_cents = 890000,
          developer_signed_at = now() - interval '8 days'
      where project_id = ${q(projectIds.mine)};

    update projects set stage = 'in_delivery' where id = ${q(projectIds.mine)};

    insert into milestones (contract_id, title, description, amount_cents, position, status, due_on, funded_at, submitted_at, accepted_at, released_at)
    select c.id, 'Invoice import and matching', 'Import supplier invoices and match to purchase orders.', 267000, 0, 'released', current_date - 2, now() - interval '8 days', now() - interval '5 days', now() - interval '2 days', now() - interval '2 days'
      from contracts c where c.project_id = ${q(projectIds.mine)};

    insert into milestones (contract_id, title, description, amount_cents, position, status, due_on, funded_at)
    select c.id, 'Exception queue', 'Finance reviews only the invoices that did not match.', 356000, 1, 'funded', current_date + 7, now() - interval '1 day'
      from contracts c where c.project_id = ${q(projectIds.mine)};

    insert into milestones (contract_id, title, description, amount_cents, position, status, due_on)
    select c.id, 'Monthly export and handover', 'Reconciliation export, documentation and deployment.', 267000, 2, 'pending', current_date + 21
      from contracts c where c.project_id = ${q(projectIds.mine)};
  `);

  // ---------------------------------------------------------------------
  // Delivery history. Completed contracts are the only thing that produces a
  // rating, so the directory needs a believable back catalogue.
  // ---------------------------------------------------------------------

  console.log("Building delivery history and reviews…");

  const HISTORY = [
    {
      dev: "maya.chen@okavo.test",
      reviews: [
        [5, 5, 5, 5, "Delivered the locked scope exactly, on the dates we agreed. Invoices reconciled from day one."],
        [5, 5, 5, 4, "One milestone slipped by three days and she told us a week before. Everything else was flawless."],
        [5, 5, 5, 5, "The only build we have commissioned that needed no rework at all."],
        [5, 4, 5, 5, "Two small bugs after launch, fixed within a day. Communication was excellent throughout."],
        [5, 5, 5, 5, "She pushed back on a change we asked for and was right to. Saved us money."],
        [5, 5, 4, 5, "Quiet for a couple of days mid-build, but the work spoke for itself."],
      ],
      titles: [
        "Online ordering for a coffee roastery",
        "Client billing dashboard",
        "Subscription box management",
        "B2B price list portal",
        "Retail loyalty programme",
        "Event ticketing for a venue",
      ],
    },
    {
      dev: "lena.fischer@okavo.test",
      reviews: [
        [5, 5, 5, 5, "Complex reporting, delivered without drama. The exports match our finance system to the cent."],
        [5, 5, 4, 5, "Deeply competent. Occasionally had to ask for a status update."],
        [5, 5, 5, 4, "Ran two days over on the last milestone, flagged early and made up for it."],
        [4, 5, 5, 5, "One scope item was interpreted differently. Resolved without a change order."],
      ],
      titles: [
        "Warehouse picking app",
        "Payroll export tool",
        "Fleet fuel tracking",
        "Freight quote calculator",
      ],
    },
    {
      dev: "sofia.alvarez@okavo.test",
      reviews: [
        [5, 5, 4, 5, "The assistant only answers from our documents, exactly as locked. No hallucinations in three months."],
        [4, 5, 5, 4, "Strong engineering. The first version missed one of the locked filters, fixed quickly."],
        [5, 4, 5, 5, "Excellent to work with. Some rough edges on mobile at handover."],
      ],
      titles: [
        "Legal document intake",
        "Grant application portal",
        "Insurance claim intake form",
      ],
    },
    {
      dev: "arjun.mehta@okavo.test",
      reviews: [
        [5, 4, 4, 5, "Fast and on budget. Quality is good rather than exceptional."],
        [4, 4, 5, 4, "Delivered what we locked. Needed a round of fixes on the reporting screen."],
        [5, 4, 4, 4, "Good value. I would use him again for a straightforward build."],
        [4, 4, 4, 5, "Always hit the dates. A couple of scope details needed clarifying mid-build."],
        [4, 5, 4, 4, "Solid work, reasonable price, no surprises."],
      ],
      titles: [
        "Restaurant table reservations",
        "Course booking and payments",
        "Multi-branch appointment booking",
        "Tenant maintenance requests",
        "Equipment maintenance log",
      ],
    },
    {
      dev: "noah.okonkwo@okavo.test",
      reviews: [
        [4, 4, 3, 3, "The build matched the lock, but I had to chase for updates and the last milestone was late."],
        [3, 4, 3, 4, "Two scope items needed rework before I would accept them."],
        [4, 3, 4, 3, "Design work was strong. The back end needed several fixes after handover."],
        [4, 4, 4, 4, "Fine. Nothing went wrong, nothing stood out."],
      ],
      titles: [
        "Care home shift roster",
        "Donation platform for a charity",
        "Inventory sync between two shops",
        "Supplier onboarding workflow",
      ],
    },
  ];

  const historyBuyers = [
    buyerIds["priya.raman@okavo.test"],
    buyerIds["tom.reyes@okavo.test"],
    buyerIds["anika.rao@okavo.test"],
  ];

  let historyIndex = 0;
  for (const entry of HISTORY) {
    for (let i = 0; i < entry.reviews.length; i += 1) {
      const [scope, quality, communication, timeliness, comment] = entry.reviews[i];
      const buyer = historyBuyers[historyIndex % historyBuyers.length];
      const title = entry.titles[i];
      const amount = 300000 + ((historyIndex * 137) % 900000);
      const monthsAgo = 2 + (historyIndex % 14);
      historyIndex += 1;

      await sql(`
        insert into payments (profile_id, purpose, status, amount_cents, provider, paid_at)
        values (${q(buyer)}, 'requirement_posting', 'paid', 100, 'seed',
                now() - interval '${monthsAgo} months');
      `);

      const created = await sql(`
        insert into projects
          (buyer_id, title, category, outcome_statement, stage,
           budget_min_cents, budget_max_cents, monthly_run_cents, timeline_weeks,
           published_at, created_at)
        values (${q(buyer)}, ${q(title)}, 'Completed build',
                ${q(`${title}, delivered against a locked scope.`)}, 'drafting',
                ${amount}, ${amount + 200000}, 12000, 6,
                now() - interval '${monthsAgo} months',
                now() - interval '${monthsAgo} months')
        returning id;
      `);
      const projectId = created[0].id;

      await sql(`
        insert into scope_items (project_id, label, detail, included, position)
        values (${q(projectId)}, 'Delivered scope',
                'Agreed before work started and accepted on completion.', true, 0);

        insert into contracts
          (project_id, buyer_id, lock_reference, status, agreed_monthly_cents, agreed_weeks)
        values (${q(projectId)}, ${q(buyer)},
                'LOCK-' || upper(substr(md5(random()::text), 1, 6)), 'draft', 12000, 6);

        update contracts set status = 'locked',
                             locked_at = now() - interval '${monthsAgo} months',
                             buyer_signed_at = now() - interval '${monthsAgo} months'
          where project_id = ${q(projectId)};

        update projects set stage = 'locked' where id = ${q(projectId)};

        insert into bids
          (project_id, developer_id, status, amount_cents, monthly_run_cents,
           delivery_weeks, message, accepts_locked_scope, created_at)
        values (${q(projectId)}, ${q(devIds[entry.dev])}, 'awarded', ${amount}, 12000, 6,
                'Fixed price against the locked scope.', true,
                now() - interval '${monthsAgo} months');

        update contracts
          set developer_id = ${q(devIds[entry.dev])},
              status = 'completed',
              agreed_amount_cents = ${amount},
              developer_signed_at = now() - interval '${monthsAgo} months',
              completed_at = now() - interval '${monthsAgo - 1} months'
          where project_id = ${q(projectId)};

        update projects set stage = 'closed' where id = ${q(projectId)};

        insert into milestones (contract_id, title, description, amount_cents, position, status, released_at)
        select c.id, 'Delivery', 'Locked scope delivered and accepted.', ${amount}, 0, 'released',
               now() - interval '${monthsAgo - 1} months'
          from contracts c where c.project_id = ${q(projectId)};

        insert into reviews
          (contract_id, author_id, subject_id, score_scope, score_quality,
           score_communication, score_timeliness, comment, created_at)
        select c.id, ${q(buyer)}, ${q(devIds[entry.dev])}, ${scope}, ${quality},
               ${communication}, ${timeliness}, ${q(comment)},
               now() - interval '${monthsAgo - 1} months'
          from contracts c where c.project_id = ${q(projectId)};
      `);
    }
  }

  // Your own developer account needs a record too, or its profile looks empty.
  const selfHistory = [
    [5, 5, 5, 4, "Delivered the locked scope with one short delay that was flagged early.", "Retail stock reconciliation"],
    [4, 5, 5, 5, "Excellent communication. One scope item needed a second pass.", "Purchase order approvals"],
  ];

  for (let i = 0; i < selfHistory.length; i += 1) {
    const [scope, quality, communication, timeliness, comment, title] = selfHistory[i];
    const buyer = historyBuyers[i % historyBuyers.length];
    const monthsAgo = 3 + i * 2;
    const amount = 640000 + i * 90000;

    await sql(`
      insert into payments (profile_id, purpose, status, amount_cents, provider, paid_at)
      values (${q(buyer)}, 'requirement_posting', 'paid', 100, 'seed', now() - interval '${monthsAgo} months');
    `);
    const created = await sql(`
      insert into projects
        (buyer_id, title, category, outcome_statement, stage,
         budget_min_cents, budget_max_cents, monthly_run_cents, timeline_weeks, published_at, created_at)
      values (${q(buyer)}, ${q(title)}, 'Completed build',
              ${q(`${title}, delivered against a locked scope.`)}, 'drafting',
              ${amount}, ${amount + 150000}, 14000, 6,
              now() - interval '${monthsAgo} months', now() - interval '${monthsAgo} months')
      returning id;
    `);
    const projectId = created[0].id;

    await sql(`
      insert into scope_items (project_id, label, detail, included, position)
      values (${q(projectId)}, 'Delivered scope', 'Agreed before work started.', true, 0);

      insert into contracts (project_id, buyer_id, lock_reference, status, agreed_monthly_cents, agreed_weeks)
      values (${q(projectId)}, ${q(buyer)}, 'LOCK-' || upper(substr(md5(random()::text), 1, 6)), 'draft', 14000, 6);

      update contracts set status = 'locked', locked_at = now() - interval '${monthsAgo} months',
                           buyer_signed_at = now() - interval '${monthsAgo} months'
        where project_id = ${q(projectId)};

      update projects set stage = 'locked' where id = ${q(projectId)};

      insert into bids (project_id, developer_id, status, amount_cents, monthly_run_cents,
                        delivery_weeks, message, accepts_locked_scope, created_at)
      values (${q(projectId)}, ${q(devSelf)}, 'awarded', ${amount}, 14000, 6,
              'Fixed price against the locked scope.', true, now() - interval '${monthsAgo} months');

      update contracts set developer_id = ${q(devSelf)}, status = 'completed',
                           agreed_amount_cents = ${amount},
                           developer_signed_at = now() - interval '${monthsAgo} months',
                           completed_at = now() - interval '${monthsAgo - 1} months'
        where project_id = ${q(projectId)};

      update projects set stage = 'closed' where id = ${q(projectId)};

      insert into milestones (contract_id, title, description, amount_cents, position, status, released_at)
      select c.id, 'Delivery', 'Locked scope delivered and accepted.', ${amount}, 0, 'released',
             now() - interval '${monthsAgo - 1} months'
        from contracts c where c.project_id = ${q(projectId)};

      insert into reviews (contract_id, author_id, subject_id, score_scope, score_quality,
                           score_communication, score_timeliness, comment, created_at)
      select c.id, ${q(buyer)}, ${q(devSelf)}, ${scope}, ${quality}, ${communication},
             ${timeliness}, ${q(comment)}, now() - interval '${monthsAgo - 1} months'
        from contracts c where c.project_id = ${q(projectId)};
    `);
  }

  console.log("Adding conversations and notifications…");
  await sql(`
    insert into message_threads (project_id, buyer_id, developer_id, subject, last_message_at)
    values
      (${q(projectIds.openBids)}, ${q(buyerSelf)}, ${q(devIds["arjun.mehta@okavo.test"])},
       'Customer portal with subscription billing', now() - interval '2 hours'),
      (${q(projectIds.inDelivery)}, ${q(buyerSelf)}, ${q(devIds["maya.chen@okavo.test"])},
       'Field service scheduling tool', now() - interval '1 day'),
      (${q(projectIds.mine)}, ${q(buyerIds["priya.raman@okavo.test"])}, ${q(devSelf)},
       'Invoice reconciliation tool', now() - interval '5 hours');

    insert into messages (thread_id, sender_id, body, created_at)
    select t.id, ${q(devIds["arjun.mehta@okavo.test"])},
           'Quick question before you shortlist: do invoices need to match your accounting system exactly, or is a CSV export enough?',
           now() - interval '3 hours'
      from message_threads t where t.project_id = ${q(projectIds.openBids)};

    insert into messages (thread_id, sender_id, body, created_at)
    select t.id, ${q(buyerSelf)},
           'A CSV export is enough for now. Exact accounting sync would be a change order later.',
           now() - interval '2 hours'
      from message_threads t where t.project_id = ${q(projectIds.openBids)};

    insert into messages (thread_id, sender_id, body, created_at)
    select t.id, ${q(devIds["maya.chen@okavo.test"])},
           'Milestone two is submitted. The staging link is in the deliverable — engineers can update a job in three taps as agreed.',
           now() - interval '1 day'
      from message_threads t where t.project_id = ${q(projectIds.inDelivery)};

    insert into messages (thread_id, sender_id, body, created_at)
    select t.id, ${q(buyerIds["priya.raman@okavo.test"])},
           'Finance reviewed the first milestone and signed it off. Escrow for the exception queue is funded.',
           now() - interval '5 hours'
      from message_threads t where t.project_id = ${q(projectIds.mine)};

    insert into notifications (profile_id, kind, title, body, link_path, created_at)
    values
      (${q(buyerSelf)}, 'bid', 'Four bids on your portal requirement',
       'Maya Chen, Arjun Mehta, Noah Okonkwo and Lena Fischer bid on the same locked scope.',
       '/app/project/${projectIds.openBids}', now() - interval '2 days'),
      (${q(buyerSelf)}, 'milestone', 'Milestone submitted for review',
       'Maya Chen submitted "Field updates on mobile" against the locked scope.',
       '/app/contract/${projectIds.inDelivery}', now() - interval '1 day'),
      (${q(buyerSelf)}, 'message', 'New message from Arjun Mehta',
       'A question about invoice exports on your portal requirement.',
       '/app/messages', now() - interval '3 hours'),
      (${q(devSelf)}, 'contract', 'You were awarded a contract',
       'Northline Labs hired you for the invoice reconciliation tool.',
       '/app/contract/${projectIds.mine}', now() - interval '9 days'),
      (${q(devSelf)}, 'payment', 'Escrow funded',
       'Northline Labs funded "Exception queue" into escrow.',
       '/app/earnings', now() - interval '1 day'),
      (${q(devSelf)}, 'bid', 'Five requirements are open for bids',
       'New locked requirements are on the board matching your profile.',
       '/app', now() - interval '6 hours');
  `);

  const summary = await sql(`
    select
      (select count(*) from projects) as projects,
      (select count(*) from projects p where p.stage = 'locked') as open_for_bids,
      (select count(*) from reviews) as reviews,
      (select count(*) from bids) as bids,
      (select count(*) from contracts) as contracts,
      (select count(*) from milestones) as milestones,
      (select count(*) from message_threads) as threads,
      (select count(*) from notifications) as notifications;
  `);

  console.log("\nSeeded:", summary[0]);
  console.log(`\nDummy accounts (password ${TEST_PASSWORD}):`);
  for (const d of DEVELOPERS) console.log(`  developer  ${d.email}  ${d.name}`);
  for (const b of BUYERS) console.log(`  buyer      ${b.email}  ${b.org}`);
}

main().catch((error) => {
  console.error("\nSeed failed:", error.message);
  process.exit(1);
});
