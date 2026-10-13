#!/usr/bin/env node
/**
 * High-value RLS / authorization matrix against staging only.
 *
 * Compares what each role can see (user JWT) against ground truth patterns
 * that historically broke: cross-buyer drafts, competitor bids, payment
 * minting, role escalation, RPC admin gates, and storage folder isolation.
 *
 * Requires a seeded staging project (seed-accounts + seed-test-data).
 * Refuses production credentials — use okavo.mjs for production inspection.
 *
 *   node scripts/rls-matrix.mjs
 */

import {
  assertStagingOnly,
  fail,
  managementSql,
  passwordSignIn,
  requireAnonKey,
  resolveTarget,
  restAs,
  serviceHeaders,
} from "./lib/okavo-env.mjs";

console.error(
  "npm run rls targeted Supabase row-level security and is retired. Authorization is enforced in the Worker. See cloudflare/worker/test/marketplace.integration.test.mjs.",
);
process.exit(1);

const TEST_PASSWORD = "123456789";

const ACCOUNTS = {
  buyerA: "fk_qrf@yahoo.com",
  buyerB: "priya.raman@okavo.test",
  developerA: "fktiindia@gmail.com",
  developerB: "arjun.mehta@okavo.test",
  admin: "admin@okavo.app",
};

const target = resolveTarget();
assertStagingOnly(target);
requireAnonKey(target);

console.log(`RLS matrix against ${target.projectRef} (${target.envName})…\n`);

const pass = [];
const failures = [];

function check(name, ok, detail = "") {
  const line = `${name}${detail ? ` — ${detail}` : ""}`;
  if (ok) pass.push(line);
  else failures.push(line);
  console.log(`${ok ? "✓" : "✗"} ${line}`);
}

async function sql(query) {
  return managementSql(target, query);
}

async function userId(email) {
  const rows = await sql(
    `select id from auth.users where email = '${email.replace(/'/g, "''")}' limit 1`
  );
  return rows[0]?.id ?? null;
}

async function signIn(email) {
  const token = await passwordSignIn(target, email, TEST_PASSWORD);
  if (!token) fail(`Could not sign in as ${email} (is staging seeded?)`);
  return token;
}

async function rest(path, token, init = {}) {
  return restAs(target, path, token, init);
}

async function rpc(name, token, body = {}) {
  return rest(`rpc/${name}`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function storage(method, bucket, objectPath, token, body) {
  const anon = requireAnonKey(target);
  const res = await fetch(
    `${target.supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`,
    {
      method,
      headers: {
        apikey: anon,
        Authorization: `Bearer ${token}`,
        "Content-Type": "text/plain",
      },
      body,
    }
  );
  return { status: res.status, ok: res.ok };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const tokens = {};
const ids = {};

for (const [role, email] of Object.entries(ACCOUNTS)) {
  ids[role] = await userId(email);
  check(`${role} account exists`, Boolean(ids[role]), email);
  if (ids[role]) {
    tokens[role] = await signIn(email);
    check(`${role} can sign in`, Boolean(tokens[role]));
  }
}

if (!tokens.buyerA || !tokens.developerA || !tokens.admin) {
  fail("Core accounts missing — run seed-accounts and seed-test-data on staging first.");
}

const otherDraft = (
  await sql(`
    select id, buyer_id, title, stage
      from projects
     where stage = 'drafting'
       and buyer_id is distinct from '${ids.buyerA}'
     limit 1
  `)
)[0];

const multiBid = (
  await sql(`
    select project_id, count(*)::int as n
      from bids
     group by project_id
    having count(*) > 1
     order by n desc
     limit 1
  `)
)[0];

const foreignPayment = ids.buyerB
  ? (
      await sql(`
        select id, profile_id
          from payments
         where profile_id = '${ids.buyerB}'
           and purpose = 'requirement_posting'
         limit 1
      `)
    )[0]
  : null;

const foreignThread = (
  await sql(`
    select id, buyer_id, developer_id
      from message_threads
     where buyer_id is distinct from '${ids.buyerA}'
       and developer_id is distinct from '${ids.developerA}'
     limit 1
  `)
)[0];

const foreignNotification = (
  await sql(`
    select id, profile_id
      from notifications
     where profile_id is distinct from '${ids.buyerA}'
     limit 1
  `)
)[0];

// ---------------------------------------------------------------------------
// P0 — cross-tenant isolation
// ---------------------------------------------------------------------------

if (otherDraft) {
  const { body, status } = await rest(
    `projects?id=eq.${otherDraft.id}&select=id,title,buyer_id`,
    tokens.buyerA
  );
  const rows = Array.isArray(body) ? body : [];
  check(
    "buyer A cannot read buyer B draft project",
    status === 200 && rows.length === 0,
    rows.length ? `LEAK ${rows.length} row(s)` : "empty"
  );
} else {
  check("buyer A cannot read buyer B draft project", false, "no other draft in staging seed");
}

{
  const { body } = await rest(
    `projects?select=id,buyer_id&stage=eq.drafting`,
    tokens.buyerA
  );
  const rows = Array.isArray(body) ? body : [];
  const leaked = rows.some((r) => r.buyer_id !== ids.buyerA);
  check(
    "buyer A draft list is own-only",
    !leaked,
    leaked ? "LEAK" : `${rows.length} own drafts`
  );
}

if (tokens.buyerB && multiBid) {
  const { body: asDev } = await rest(
    `bids?project_id=eq.${multiBid.project_id}&select=id,developer_id,amount_cents`,
    tokens.developerB
  );
  const devRows = Array.isArray(asDev) ? asDev : [];
  const onlyOwn = devRows.every((r) => r.developer_id === ids.developerB);
  check(
    "developer sees only own bids on multi-bid project",
    onlyOwn,
    `${devRows.length} row(s)`
  );

  const buyerOfProject = (
    await sql(`select buyer_id from projects where id = '${multiBid.project_id}'`)
  )[0]?.buyer_id;

  if (buyerOfProject === ids.buyerA) {
    const { body: asBuyer } = await rest(
      `bids?project_id=eq.${multiBid.project_id}&select=id,developer_id`,
      tokens.buyerA
    );
    const buyerRows = Array.isArray(asBuyer) ? asBuyer : [];
    check(
      "buyer sees all bids on own project",
      buyerRows.length >= 2,
      `${buyerRows.length} bids`
    );
  }
}

{
  const { body } = await rest(`payments?select=id,profile_id`, tokens.buyerA);
  const rows = Array.isArray(body) ? body : [];
  // Contract-party payments may surface another profile_id; assert the known
  // unrelated platform fee row from ground truth is never returned.
  const foreignOwned = foreignPayment
    ? rows.some((r) => r.id === foreignPayment.id)
    : false;
  check(
    "buyer A cannot read unrelated foreign platform payments",
    !foreignOwned,
    foreignOwned ? `saw payment ${foreignPayment.id}` : `${rows.length} visible`
  );
}

if (foreignNotification) {
  const { body } = await rest(
    `notifications?id=eq.${foreignNotification.id}&select=id,profile_id`,
    tokens.buyerA
  );
  const rows = Array.isArray(body) ? body : [];
  check(
    "buyer A cannot read another user's notifications",
    rows.length === 0,
    rows.length ? "LEAK" : "empty"
  );
}

if (foreignThread) {
  const { body } = await rest(
    `message_threads?id=eq.${foreignThread.id}&select=id`,
    tokens.buyerA
  );
  const rows = Array.isArray(body) ? body : [];
  check(
    "buyer A cannot read unrelated message threads",
    rows.length === 0,
    rows.length ? "LEAK" : "empty"
  );
}

// ---------------------------------------------------------------------------
// P0 — write denial / escalation
// ---------------------------------------------------------------------------

{
  const attempt = await rest("payments", tokens.buyerA, {
    method: "POST",
    body: JSON.stringify({
      profile_id: ids.buyerA,
      purpose: "requirement_posting",
      status: "paid",
      amount_cents: 100,
      provider: "rls-matrix",
    }),
  });
  check(
    "client cannot insert payments",
    attempt.status >= 400,
    `status ${attempt.status}`
  );
}

{
  const attempt = await rest("payments", tokens.admin, {
    method: "POST",
    body: JSON.stringify({
      profile_id: ids.admin,
      purpose: "requirement_posting",
      status: "paid",
      amount_cents: 100,
      provider: "rls-matrix",
    }),
  });
  check(
    "admin JWT cannot mint payments either",
    attempt.status >= 400,
    `status ${attempt.status}`
  );
}

{
  const before = (
    await sql(
      `select role::text as role from profiles where id = '${ids.developerA}'`
    )
  )[0]?.role;
  await rest(`profiles?id=eq.${ids.developerA}`, tokens.developerA, {
    method: "PATCH",
    body: JSON.stringify({ role: "admin" }),
  });
  const after = (
    await sql(
      `select role::text as role from profiles where id = '${ids.developerA}'`
    )
  )[0]?.role;
  check(
    "developer cannot escalate role to admin",
    after === before && after !== "admin",
    `role=${after}`
  );
}

{
  const before = (
    await sql(`
      select identity_status::text as identity_status, tier::text as tier,
             bidding_unlocked_at
        from developer_profiles
       where profile_id = '${ids.developerA}'
    `)
  )[0];

  await rest(`developer_profiles?profile_id=eq.${ids.developerA}`, tokens.developerA, {
    method: "PATCH",
    body: JSON.stringify({
      identity_status: "approved",
      tier: "principal",
      bidding_unlocked_at: new Date().toISOString(),
      contracts_delivered: 999,
    }),
  });

  const after = (
    await sql(`
      select identity_status::text as identity_status, tier::text as tier,
             contracts_delivered
        from developer_profiles
       where profile_id = '${ids.developerA}'
    `)
  )[0];

  check(
    "developer cannot self-approve identity / raise tier",
    after?.identity_status === before?.identity_status &&
      after?.tier === before?.tier &&
      after?.contracts_delivered === before?.contracts_delivered,
    `status=${after?.identity_status} tier=${after?.tier}`
  );
}

{
  const attempt = await rest("projects", tokens.buyerA, {
    method: "POST",
    body: JSON.stringify({
      buyer_id: ids.buyerA,
      title: "RLS matrix — must reject without fee",
      category: "Web application",
      outcome_statement: "Posting fee gate.",
      budget_min_cents: 100000,
      budget_max_cents: 200000,
      monthly_run_cents: 1000,
      timeline_weeks: 4,
    }),
  });
  const blocked =
    attempt.status >= 400 &&
    JSON.stringify(attempt.body).toLowerCase().includes("posting fee");
  check(
    "posting fee gate rejects unpaid project insert",
    blocked,
    `status ${attempt.status}`
  );
}

// ---------------------------------------------------------------------------
// Role visibility
// ---------------------------------------------------------------------------

{
  const { status, body } = await rest(
    `identity_verifications?select=id&limit=5`,
    tokens.buyerA
  );
  const rows = Array.isArray(body) ? body : [];
  check(
    "buyer cannot read identity verification queue",
    status === 200 && rows.length === 0,
    `status ${status}, ${rows.length} rows`
  );
}

{
  const { status, body } = await rest(
    `identity_verifications?select=id&limit=5`,
    tokens.admin
  );
  check(
    "admin can read identity verification queue",
    status === 200,
    `status ${status}, ${Array.isArray(body) ? body.length : 0} rows`
  );
}

{
  const { status, body } = await rest(`site_visits?select=id&limit=1`, tokens.developerA);
  const rows = Array.isArray(body) ? body : [];
  check(
    "developer cannot read site_visits",
    status === 200 && rows.length === 0,
    `status ${status}`
  );
}

{
  const { status } = await rest(`site_visits?select=id&limit=1`, tokens.admin);
  check("admin can query site_visits", status === 200, `status ${status}`);
}

{
  const { status, body } = await rest(`profiles?select=id&limit=50`, tokens.admin);
  check(
    "admin sees many profiles",
    status === 200 && Array.isArray(body) && body.length >= 3,
    `${Array.isArray(body) ? body.length : 0} profiles`
  );
}

// ---------------------------------------------------------------------------
// RPCs
// ---------------------------------------------------------------------------

{
  const { status, body } = await rpc("has_unconsumed_posting_fee", tokens.buyerA);
  check(
    "buyer can call has_unconsumed_posting_fee",
    status === 200 && (body === true || body === false),
    `status ${status}`
  );
}

{
  const { status, text, body } = await rpc("analytics_overview", tokens.developerA, {
    days: 7,
  });
  const denied =
    status >= 400 ||
    /admins? only/i.test(JSON.stringify(body ?? text ?? ""));
  check(
    "developer cannot call analytics_overview",
    denied,
    `status ${status}`
  );
}

{
  const { status } = await rpc("analytics_overview", tokens.admin, { days: 7 });
  check("admin can call analytics_overview", status === 200, `status ${status}`);
}

{
  const fakeDispute = "00000000-0000-0000-0000-000000000001";
  const { status, body, text } = await rpc(
    "resolve_dispute_against_scope",
    tokens.buyerA,
    { p_dispute_id: fakeDispute, p_note: "nope" }
  );
  const denied =
    status >= 400 ||
    /only okavo|not authenticated|admins? only|dispute/i.test(
      JSON.stringify(body ?? text ?? "")
    );
  check(
    "buyer cannot resolve disputes via RPC",
    denied,
    `status ${status}`
  );
}

{
  const { status, body, text } = await rpc(
    "admin_decide_build_exam",
    tokens.developerA,
    {
      p_exam_id: "00000000-0000-0000-0000-000000000001",
      p_approve: true,
      p_notes: "nope",
    }
  );
  const denied = status >= 400;
  check(
    "developer cannot call admin_decide_build_exam",
    denied,
    `status ${status} ${JSON.stringify(body ?? text).slice(0, 80)}`
  );
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

{
  const path = `${ids.developerA}/rls-matrix-${Date.now()}.txt`;
  const upload = await storage(
    "POST",
    "identity-documents",
    path,
    tokens.developerA,
    "rls-matrix"
  );
  check(
    "developer can upload to own identity-documents folder",
    upload.ok,
    `status ${upload.status}`
  );

  const intruder = await storage(
    "POST",
    "identity-documents",
    `${ids.buyerA}/hack-${Date.now()}.txt`,
    tokens.developerA,
    "should fail"
  );
  check(
    "developer cannot upload into another user's identity folder",
    !intruder.ok,
    `status ${intruder.status}`
  );

  if (upload.ok) {
    await storage("DELETE", "identity-documents", path, tokens.developerA);
  }
}

{
  const path = `${ids.developerA}/rls-deliverable-${Date.now()}.txt`;
  const upload = await storage(
    "POST",
    "deliverables",
    path,
    tokens.developerA,
    "deliverable probe"
  );
  check(
    "developer can upload under own deliverables folder",
    upload.ok,
    `status ${upload.status}`
  );

  // Unrelated buyer must not read a deliverable that is not linked to a
  // shared contract (policy joins deliverables → milestones → contracts).
  if (upload.ok && tokens.buyerB) {
    const read = await storage(
      "GET",
      "deliverables",
      path,
      tokens.buyerB
    );
    check(
      "unrelated buyer cannot read orphan deliverable object",
      !read.ok,
      `status ${read.status}`
    );
    await storage("DELETE", "deliverables", path, tokens.developerA);
  } else if (upload.ok) {
    await storage("DELETE", "deliverables", path, tokens.developerA);
  }
}

// ---------------------------------------------------------------------------
// Anonymous must be denied
// ---------------------------------------------------------------------------

{
  const anon = requireAnonKey(target);
  const res = await fetch(`${target.supabaseUrl}/rest/v1/projects?select=id&limit=1`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  const rows = Array.isArray(body) ? body : [];
  check(
    "anonymous cannot read projects",
    res.status === 401 || res.status === 403 || rows.length === 0,
    `status ${res.status}`
  );
}

// Service-role ground truth still works (sanity for the matrix harness).
{
  const headers = serviceHeaders(target);
  const res = await fetch(
    `${target.supabaseUrl}/rest/v1/profiles?select=id&limit=1`,
    { headers }
  );
  check("service role can read profiles (ground truth)", res.ok, `status ${res.status}`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${pass.length} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAIL");
  for (const f of failures) console.log("  ✗", f);
  process.exit(1);
}
console.log("\nAll RLS matrix checks passed.");
