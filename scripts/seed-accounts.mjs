#!/usr/bin/env node
/**
 * Creates the three demo accounts through the public signup endpoint.
 *
 * Requires "Confirm email" to be OFF in Supabase (Authentication → Sign In /
 * Providers) at the time this runs, otherwise the accounts are created but stay
 * unconfirmed and cannot sign in. Turn it back on afterwards; accounts already
 * confirmed stay confirmed.
 *
 * Refuses production unless OKAVO_ALLOW_PRODUCTION_DESTRUCTIVE=1.
 * Point SUPABASE_URL / VITE_SUPABASE_URL at staging.
 *
 *   node scripts/seed-accounts.mjs
 */

import {
  assertSafeForDestructiveSeed,
  fail,
  requireAnonKey,
  resolveTarget,
} from "./lib/okavo-env.mjs";

console.error(
  "seed:accounts is retired. Supabase was deleted. Create an account at https://okavo.org/signin and confirm the email code. This script does not insert rows.",
);
process.exit(1);

const target = resolveTarget();
assertSafeForDestructiveSeed(target);

const url = target.supabaseUrl;
const key = requireAnonKey(target);

if (!url || !key) {
  fail("Missing SUPABASE_URL / VITE_SUPABASE_URL or anon key");
}

console.log(`Seeding accounts on ${target.projectRef} (${target.envName})…`);

const ACCOUNTS = [
  {
    email: "fk_qrf@yahoo.com",
    password: "123456789",
    data: {
      role: "buyer",
      full_name: "Fakhruddin Khambaty",
      organization_name: "Khambaty Ventures",
      scale: "smb",
    },
  },
  {
    email: "fktiindia@gmail.com",
    password: "123456789",
    data: { role: "developer", full_name: "FKTI India" },
  },
  {
    email: "admin@okavo.app",
    password: "123456789",
    data: { role: "admin", full_name: "Okavo Admin" },
  },
];

async function signUp(account) {
  const response = await fetch(`${url}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: account.email,
      password: account.password,
      data: account.data,
    }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = body.msg || body.error_description || body.message || "";
    if (/already registered|already been registered/i.test(message)) {
      return `exists already`;
    }
    return `FAILED ${response.status} ${message}`;
  }

  if (body.access_token) return "created and signed in";
  if (body.user && !body.user.confirmed_at && !body.user.email_confirmed_at) {
    return "created but UNCONFIRMED — turn off Confirm email and delete/retry";
  }
  return "created";
}

for (const account of ACCOUNTS) {
  const result = await signUp(account);
  console.log(`${account.data.role.padEnd(9)} ${account.email.padEnd(24)} ${result}`);
}
