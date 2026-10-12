#!/usr/bin/env node
/**
 * Okavo agent console.
 *
 * One entry point for driving the whole application from a terminal, so an
 * AI agent (or you) can inspect every screen, sign in as any user, and read
 * any table without clicking through the interface.
 *
 * Credentials are read from .okavo-agent, which is gitignored and never
 * committed. Run `node scripts/okavo.mjs check` to confirm your setup.
 *
 * Target project is parameterized via SUPABASE_PROJECT_REF / SUPABASE_URL
 * (see .env.example). When unset, this console defaults to production so
 * existing read-only inspection still works. Destructive seeds refuse
 * production — use scripts/seed-*.mjs against staging instead.
 *
 * Two different levels of access, deliberately kept apart:
 *
 *   `db`  / `sql`  use the service role and bypass row-level security.
 *                  Use these to see ground truth.
 *   `as`  / `token` act as a real signed-in user with RLS applied.
 *                  Use these to test what a person can actually see.
 *
 * The difference between those two is where most access bugs hide.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ROOT,
  conf,
  fail,
  managementSql,
  resolveTarget,
  serviceHeaders,
  sessionFor,
  requireAnonKey,
} from "./lib/okavo-env.mjs";

const target = resolveTarget({ defaultToProduction: true });
const { projectRef: PROJECT_REF, supabaseUrl: SUPABASE_URL, siteUrl: SITE_URL } = target;

const out = (value) =>
  console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));

function anonKey() {
  return requireAnonKey(target);
}

// ---------------------------------------------------------------------------
// Route map, read from the router so it cannot drift
// ---------------------------------------------------------------------------

function screens() {
  const source = readFileSync(join(ROOT, "apps/catalog/src/App.tsx"), "utf8");
  const rows = [];

  // Public routes sit at the top level; app routes are nested under /app.
  const publicRoutes = [...source.matchAll(/<Route path="(\/[^"]*)" element=\{<(\w+)/g)];
  for (const [, path, element] of publicRoutes) {
    if (path === "*") continue;
    rows.push({ path, screen: element, access: "public" });
  }

  const appBlock = source.slice(source.indexOf('path="/app"'));
  const nested = [...appBlock.matchAll(
    /<Route\s+(?:index|path="([^"]+)")\s+element=\{\s*(?:<(\w+)Only>\s*)?<(\w+)/g
  )];
  for (const [, path, guard, element] of nested) {
    rows.push({
      path: path ? `/app/${path}` : "/app",
      screen: element,
      access: guard ? guard.toLowerCase() : "any signed-in role",
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function retired(command) {
  fail(
    `${command} targeted the deleted Supabase project. Accounts and rows now live in Cloudflare D1 behind the Worker. This console does not mint sessions or bypass that API.`
  );
}

const commands = {
  async check() {
    retired("check");
  },

  async accounts() {
    retired("accounts");
    const rows = await managementSql(target, `
      select u.email,
             coalesce(p.role::text, 'no profile') as role,
             p.full_name,
             bp.organization_name,
             dp.identity_status::text,
             (dp.bidding_unlocked_at is not null) as can_bid,
             u.id
        from auth.users u
        left join profiles p on p.id = u.id
        left join buyer_profiles bp on bp.profile_id = u.id
        left join developer_profiles dp on dp.profile_id = u.id
       order by p.role, u.email;
    `);
    out(rows);
  },

  async screens() {
    out(screens());
  },

  async token() {
    retired("token");
    const email = "";
    if (!email) fail("Usage: token <email>");
    const session = await sessionFor(target, email);
    out({
      email,
      access_token: session.access_token,
      expires_in: session.expires_in,
      user_id: session.user?.id,
    });
  },

  /** Read any table with the service role. Row-level security does not apply. */
  async db() {
    retired("db");
    const table = "";
    const query = "";
    if (!table) fail('Usage: db <table> ["select=*&limit=5"]');
    const qs = query ?? "select=*&limit=20";
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
      headers: serviceHeaders(target),
    });
    const body = await response.text();
    if (!response.ok) fail(`${response.status}: ${body.slice(0, 300)}`);
    out(JSON.parse(body));
  },

  async sql() {
    retired("sql");
    const args = [];
    const query = args.join(" ");
    if (!query) fail('Usage: sql "select count(*) from projects"');
    out(await managementSql(target, query));
  },

  /**
   * Call the API as a real user, with row-level security applied. This is the
   * command that answers "what can this person actually see?".
   */
  async as() {
    retired("as");
    const args = [];
    const [email, method = "GET", path, ...rest] = args;
    if (!email || !path) {
      fail('Usage: as <email> <GET|POST|PATCH|DELETE> <path> [json]\n' +
        '  e.g. as fk_qrf@yahoo.com GET "projects?select=title,stage"');
    }
    const session = await sessionFor(target, email);
    const body = rest.join(" ");

    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: method.toUpperCase(),
      headers: {
        apikey: anonKey(),
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: body || undefined,
    });

    const text = await response.text();
    console.log(`# ${method.toUpperCase()} ${path} as ${email} → ${response.status}`);
    out(text ? JSON.parse(text) : null);
  },

  /** Open a screen in a real browser as a given user and save a screenshot. */
  async shot(args) {
    const path = args[0] ?? "/";
    const asIndex = args.indexOf("--as");
    const email = asIndex === -1 ? null : args[asIndex + 1];
    if (email) retired("shot --as");
    const file = `/tmp/okavo${path.replace(/[^\w]+/g, "-")}${email ? `-${email.split("@")[0]}` : ""}.png`;

    let chromium;
    try {
      ({ chromium } = await import("playwright"));
    } catch {
      fail("Playwright is not installed.\n  npm i -D playwright && npx playwright install chromium");
    }

    const session = email ? await sessionFor(target, email) : null;
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const page = await context.newPage();

    if (session) {
      // Seed the Supabase session before the app boots so it loads signed in.
      const storageKey = `sb-${PROJECT_REF}-auth-token`;
      await page.addInitScript(
        ([key, value]) => window.localStorage.setItem(key, value),
        [storageKey, JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600),
          token_type: "bearer",
          user: session.user,
        })]
      );
    }

    await page.goto(`${SITE_URL}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: file, fullPage: true });

    const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 1200));
    await browser.close();

    console.log(`# ${SITE_URL}${path}${email ? ` as ${email}` : " (signed out)"}`);
    console.log(`# screenshot: ${file}\n`);
    console.log(text);
  },

  async help() {
    console.log(`
Okavo agent console

  screens                        Every route and who is allowed to see it
  shot <path>                    Screenshot a public screen
  check, accounts, token, as, db, sql, shot --as
                                 Retired. They talked to the deleted Supabase project.

Examples

  node scripts/okavo.mjs accounts
  node scripts/okavo.mjs as fk_qrf@yahoo.com GET "projects?select=title,stage"
  node scripts/okavo.mjs db payments "select=purpose,status,amount_cents&limit=5"
  node scripts/okavo.mjs sql "select role, count(*) from profiles group by role"
  node scripts/okavo.mjs shot /app/traffic --as admin@okavo.app

Target is set by SUPABASE_PROJECT_REF / SUPABASE_URL (defaults to production
for this read-only console). Set OKAVO_SITE=http://127.0.0.1:5180 to drive
the local dev server instead.
`);
  },
};

const [command, ...args] = process.argv.slice(2);
const handler = commands[command ?? "help"];
if (!handler) fail(`Unknown command "${command}". Run: node scripts/okavo.mjs help`);
await handler(args);
