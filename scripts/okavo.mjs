#!/usr/bin/env node
/**
 * Okavo operator console.
 *
 * Accounts, marketplace rows, and payments live in Cloudflare D1 `okavo`.
 * These commands read that database through Wrangler. They do not talk to
 * Supabase, mint a password, or insert sample people or requirements.
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { queryD1 } from "./lib/d1.mjs";
import { ROOT, fail, resolveTarget } from "./lib/okavo-env.mjs";

const target = resolveTarget({ defaultToProduction: true });
const { siteUrl: SITE_URL } = target;

const out = (value) => console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));

function screens() {
  const source = readFileSync(join(ROOT, "apps/catalog/src/App.tsx"), "utf8");
  const rows = [];
  const publicRoutes = [...source.matchAll(/<Route path="(\/[^"]*)" element=\{<(\w+)/g)];
  for (const [, path, element] of publicRoutes) {
    if (path === "*") continue;
    rows.push({ path, screen: element, access: "public" });
  }
  const appBlock = source.slice(source.indexOf('path="/app"'));
  const nested = [
    ...appBlock.matchAll(/<Route\s+(?:index|path="([^"]+)")\s+element=\{\s*(?:<(\w+)Only>\s*)?<(\w+)/g),
  ];
  for (const [, path, guard, element] of nested) {
    rows.push({
      path: path ? `/app/${path}` : "/app",
      screen: element,
      access: guard ? guard.toLowerCase() : "any signed-in role",
    });
  }
  return rows;
}

const commands = {
  async check() {
    const rows = await queryD1("SELECT COUNT(*) AS profiles FROM profiles");
    out({
      database: "cloudflare-d1:okavo",
      profiles: rows[0]?.profiles ?? 0,
      note: "Read-only. This does not create accounts.",
    });
  },

  async accounts() {
    out(
      await queryD1(`
        SELECT p.email, p.role, p.full_name,
               p.email_verified_at IS NOT NULL AS email_verified,
               bp.organization_name,
               dp.identity_status, dp.interview_status,
               dp.bidding_unlocked_at IS NOT NULL AS can_bid,
               dp.blocked_at IS NOT NULL AS blocked
          FROM profiles p
          LEFT JOIN buyer_profiles bp ON bp.profile_id = p.id
          LEFT JOIN developer_profiles dp ON dp.profile_id = p.id
         ORDER BY p.role, p.email
      `),
    );
  },

  async blocks() {
    out({
      blockedDevelopers: await queryD1(`
        SELECT p.email, dp.blocked_at
          FROM developer_profiles dp
          JOIN profiles p ON p.id = dp.profile_id
         WHERE dp.blocked_at IS NOT NULL
         ORDER BY dp.blocked_at
      `),
      requests: await queryD1(`
        SELECT id, status, reason, created_at
          FROM developer_block_requests
         ORDER BY created_at DESC
         LIMIT 50
      `),
    });
  },

  async payments() {
    out(
      await queryD1(`
        SELECT id, purpose, status, amount_cents, currency, created_at
          FROM payments
         WHERE status = 'pending'
         ORDER BY created_at
         LIMIT 100
      `),
    );
  },

  async files() {
    out(
      await queryD1(`
        SELECT purpose,
               COUNT(*) AS rows,
               SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) AS active,
               SUM(CASE WHEN expires_at IS NOT NULL AND expires_at <= datetime('now') AND deleted_at IS NULL THEN 1 ELSE 0 END) AS due
          FROM files
         GROUP BY purpose
      `),
    );
  },

  async exams() {
    out(
      await queryD1(`
        SELECT status, COUNT(*) AS count
          FROM build_exams
         GROUP BY status
         ORDER BY status
      `),
    );
  },

  async liquidity() {
    out({
      verifiedBuyers: await queryD1(`
        SELECT COUNT(*) AS count FROM profiles p
          JOIN buyer_profiles b ON b.profile_id = p.id
         WHERE p.email_verified_at IS NOT NULL
      `),
      published: await queryD1("SELECT COUNT(*) AS count FROM projects WHERE published_at IS NOT NULL"),
      locked: await queryD1(
        "SELECT COUNT(*) AS count FROM projects WHERE stage IN ('locked','hired','in_delivery','delivered','closed')",
      ),
      verifiedDevelopers: await queryD1(
        "SELECT COUNT(*) AS count FROM developer_profiles WHERE identity_status = 'approved' AND interview_status = 'approved'",
      ),
      note: "Counts of live rows. This command does not insert requirements or developers.",
    });
  },

  async screens() {
    out(screens());
  },

  async responsive(args) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [join(ROOT, "scripts/responsive-audit.mjs"), ...args], { stdio: "inherit" });
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code) reject(new Error(`responsive audit exited ${code}`));
        else resolve();
      });
    });
  },

  async shot(args) {
    const path = args[0] ?? "/";
    if (args.includes("--as")) {
      fail("shot --as signed in through the deleted Supabase session. Use dummy / dummy in the browser for the demo workspace.");
    }
    const file = `/tmp/okavo${path.replace(/[^\w]+/g, "-")}.png`;
    let chromium;
    try {
      ({ chromium } = await import("playwright"));
    } catch {
      fail("Playwright is not installed.\n  npm i -D playwright && npx playwright install chromium");
    }
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    await page.goto(`${SITE_URL}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: file, fullPage: true });
    const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 1200));
    await browser.close();
    console.log(`# ${SITE_URL}${path} (signed out)`);
    console.log(`# screenshot: ${file}\n`);
    console.log(text);
  },

  async help() {
    console.log(`
Okavo operator console — Cloudflare D1

  check                          Confirm Wrangler can read D1
  accounts                       Users, roles, verification. No password hashes
  blocks                         Blocked developers and block requests
  payments                       Pending payments
  files                          File counts and retention due. No file bytes
  exams                          Build-exam queue counts
  liquidity                      Live marketplace counts
  screens                        Routes read from the React router
  shot <path>                    Screenshot a public page
  responsive [--base URL]        Viewport audit

These commands do not insert people, requirements, or testimonials.
Supabase db/sql/token/as commands are gone with the deleted project.
`);
  },
};

const [command, ...args] = process.argv.slice(2);
const handler = commands[command ?? "help"];
if (!handler) fail(`Unknown command "${command}". Run: node scripts/okavo.mjs help`);
await handler(args);
