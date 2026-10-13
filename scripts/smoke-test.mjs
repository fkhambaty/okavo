#!/usr/bin/env node
/**
 * End-to-end check against a configured Supabase project.
 * Signs in as each seeded account and exercises the paths the app uses.
 *
 * Target via SUPABASE_URL / VITE_SUPABASE_URL and anon key (see .env.example).
 * CI runs this against staging only.
 *
 *   node scripts/smoke-test.mjs
 */

import {
  fail,
  passwordSignIn,
  requireAnonKey,
  resolveTarget,
  restAs,
} from "./lib/okavo-env.mjs";

console.error(
  "npm run smoke targeted Supabase and is retired. Use node scripts/production-smoke.mjs for the live site. It does not create an account or a charge.",
);
process.exit(1);

const target = resolveTarget();
const URL = target.supabaseUrl;
const KEY = requireAnonKey(target);

if (!URL || !KEY) {
  fail("Missing SUPABASE_URL / VITE_SUPABASE_URL or anon key");
}

console.log(`Smoke against ${target.projectRef} (${target.envName})…`);

const pass = [];
const failList = [];

function check(name, ok, detail = "") {
  (ok ? pass : failList).push(`${name}${detail ? ` — ${detail}` : ""}`);
}

async function signIn(email, password) {
  return passwordSignIn(target, email, password);
}

async function rest(path, token, init = {}) {
  return restAs(target, path, token, init);
}

const ACCOUNTS = {
  buyer: "fk_qrf@yahoo.com",
  developer: "fktiindia@gmail.com",
  admin: "admin@okavo.app",
};

const tokens = {};

for (const [role, email] of Object.entries(ACCOUNTS)) {
  const token = await signIn(email, "123456789");
  tokens[role] = token;
  check(`${role} can sign in`, Boolean(token), token ? "" : "no access token");
}

// Profile visible to its owner (email is column-restricted; use id + role).
for (const [role, email] of Object.entries(ACCOUNTS)) {
  if (!tokens[role]) continue;
  const { body: sess } = await rest(
    `profiles?select=id,role&id=eq.${encodeURIComponent(
      (
        await (
          await fetch(`${URL}/auth/v1/user`, {
            headers: { apikey: KEY, Authorization: `Bearer ${tokens[role]}` },
          })
        ).json()
      ).id
    )}`,
    tokens[role]
  );
  const row = Array.isArray(sess) ? sess[0] : null;
  check(
    `${role} profile row exists`,
    row?.role === role,
    row ? `role=${row.role}` : "no row returned"
  );
}

// Developer verification state — required before bidding
if (tokens.developer) {
  const meRes = await fetch(`${URL}/auth/v1/user`, {
    headers: { apikey: KEY, Authorization: `Bearer ${tokens.developer}` },
  });
  const me = await meRes.json();
  const { body } = await rest(
    `developer_profiles?select=identity_status,tier,bidding_unlocked_at&profile_id=eq.${me.id}`,
    tokens.developer
  );
  const row = Array.isArray(body) ? body[0] : null;
  check(
    "developer identity approved",
    row?.identity_status === "approved",
    `status=${row?.identity_status}`
  );
  check(
    "developer bidding membership recorded",
    Boolean(row?.bidding_unlocked_at),
    row?.bidding_unlocked_at ? "unlocked" : "not paid yet"
  );
}

// The posting-fee paywall must reject a requirement with no fee paid
if (tokens.buyer) {
  const { body: me } = await rest("profiles?select=id", tokens.buyer);
  const buyerId = Array.isArray(me) ? me[0]?.id : null;

  const attempt = await rest("projects", tokens.buyer, {
    method: "POST",
    body: JSON.stringify({
      buyer_id: buyerId,
      title: "Smoke test — should be rejected",
      category: "Web application",
      outcome_statement: "This insert must fail without a posting fee.",
      budget_min_cents: 100000,
      budget_max_cents: 200000,
      monthly_run_cents: 1000,
      timeline_weeks: 4,
    }),
  });
  const blocked =
    attempt.status >= 400 &&
    JSON.stringify(attempt.body).includes("posting fee");
  check(
    "posting fee enforced in database",
    blocked,
    blocked ? "insert rejected" : `unexpected status ${attempt.status}`
  );
}

// Admin can see the review queue and every profile
if (tokens.admin) {
  const queue = await rest("identity_verifications?select=id", tokens.admin);
  check("admin can read verification queue", queue.status === 200, `status ${queue.status}`);

  const all = await rest("profiles?select=id", tokens.admin);
  check(
    "admin sees all profiles",
    Array.isArray(all.body) && all.body.length >= 3,
    `${Array.isArray(all.body) ? all.body.length : 0} profiles`
  );
}

// A buyer must only see their own payments (not an empty list).
if (tokens.buyer) {
  const meRes = await fetch(`${URL}/auth/v1/user`, {
    headers: { apikey: KEY, Authorization: `Bearer ${tokens.buyer}` },
  });
  const me = await meRes.json();
  const { body } = await rest("payments?select=id,profile_id", tokens.buyer);
  const rows = Array.isArray(body) ? body : [];
  const leaked = rows.some((row) => row.profile_id !== me.id);
  check(
    "payments are private to their owner",
    !leaked,
    leaked ? "LEAK" : `${rows.length} own rows`
  );
}

// A developer can upload an identity document to their own folder, and cannot
// write into somebody else's.
if (tokens.developer) {
  const meRes = await fetch(`${URL}/auth/v1/user`, {
    headers: { apikey: KEY, Authorization: `Bearer ${tokens.developer}` },
  });
  const me = await meRes.json();
  const path = `${me.id}/smoke-${Date.now()}.txt`;

  const upload = await fetch(`${URL}/storage/v1/object/identity-documents/${path}`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${tokens.developer}`,
      "Content-Type": "text/plain",
    },
    body: "smoke test",
  });
  check("developer can upload an ID document", upload.ok, `status ${upload.status}`);

  const intruder = await fetch(
    `${URL}/storage/v1/object/identity-documents/00000000-0000-0000-0000-000000000000/hack.txt`,
    {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${tokens.developer}`,
        "Content-Type": "text/plain",
      },
      body: "should be blocked",
    }
  );
  check(
    "cannot upload into another user's folder",
    !intruder.ok,
    `status ${intruder.status}`
  );

  if (upload.ok) {
    await fetch(`${URL}/storage/v1/object/identity-documents/${path}`, {
      method: "DELETE",
      headers: { apikey: KEY, Authorization: `Bearer ${tokens.developer}` },
    });
  }
}

console.log("\nPASS");
pass.forEach((p) => console.log("  ✓", p));
if (failList.length) {
  console.log("\nFAIL");
  failList.forEach((f) => console.log("  ✗", f));
}
console.log(`\n${pass.length} passed, ${failList.length} failed`);
process.exit(failList.length ? 1 : 0);
