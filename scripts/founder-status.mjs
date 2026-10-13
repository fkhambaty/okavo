#!/usr/bin/env node
/**
 * Founder seeding status.
 *
 * Prints the real D1 counts and the steps a founder has to do by hand.
 * It never inserts a requirement, a developer, a testimonial, or activity.
 */

import { queryD1 } from "./lib/d1.mjs";

const steps = [
  "Create the owner account through the normal signup form at https://okavo.org/signin and confirm the email code. Do not insert a password into D1.",
  "Post only a requirement you will actually fund. The posting fee is charged by Razorpay. There is no sample-requirement command.",
  "Ask a developer you know to sign up, upload their own identity document, and take the build exam. Do not mark a stranger verified.",
  "Read counts with `node scripts/okavo.mjs liquidity` or the admin liquidity panel. Zero means that step has not happened.",
];

console.log("Okavo founder workflow");
console.log("This script does not write to the database.\n");
for (const [index, step] of steps.entries()) {
  console.log(`${index + 1}. ${step}`);
}
console.log("");

try {
  const [buyers, requirements, developers] = await Promise.all([
    queryD1(`
      SELECT COUNT(*) AS count FROM profiles p
        JOIN buyer_profiles b ON b.profile_id = p.id
       WHERE p.email_verified_at IS NOT NULL
    `),
    queryD1("SELECT COUNT(*) AS count FROM projects WHERE published_at IS NOT NULL"),
    queryD1(
      "SELECT COUNT(*) AS count FROM developer_profiles WHERE identity_status = 'approved' AND interview_status = 'approved'",
    ),
  ]);
  console.log(
    JSON.stringify(
      {
        verifiedBuyers: buyers[0]?.count ?? 0,
        publishedRequirements: requirements[0]?.count ?? 0,
        verifiedDevelopers: developers[0]?.count ?? 0,
        inventedRows: 0,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error("Could not read D1. The steps above are still the workflow.");
  console.error(error instanceof Error ? error.message : "D1 query failed");
  process.exitCode = 1;
}
