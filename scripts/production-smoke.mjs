#!/usr/bin/env node
/**
 * Production smoke checks. No signup, no charge, no secret output.
 *
 * Homepage and API health, mail-readiness flag, dummy login in the browser,
 * a payment quote that does not create a Razorpay order, and two viewports.
 */

import { chromium } from "playwright";

const site = process.env.OKAVO_SITE || "https://okavo.org";
const api = process.env.OKAVO_API_URL || "https://okavo-api.fkhambaty.workers.dev";
const failures = [];

function fail(message) {
  failures.push(message);
  console.error(`FAIL ${message}`);
}

async function get(url) {
  const response = await fetch(url, { headers: { accept: "application/json,text/html" } });
  const text = await response.text();
  return { status: response.status, text };
}

const home = await get(site);
if (home.status !== 200) fail(`homepage ${home.status}`);
else console.log(`ok homepage ${home.status}`);

const healthResponse = await get(`${api}/v1/health`);
let health = null;
try {
  health = JSON.parse(healthResponse.text);
} catch {
  fail("health was not JSON");
}
if (healthResponse.status !== 200 || health?.ok !== true) fail(`health ${healthResponse.status}`);
else {
  console.log(
    `ok health checkout=${health.checkout} storage=${health.storage} mailConfigured=${health.mailConfigured} r2Enabled=${health.r2Enabled}`,
  );
  if (health.r2Enabled === true) fail("health claims R2 is enabled; this account is not");
  if (typeof health.mailConfigured !== "boolean") fail("health did not say whether mail is configured");
  if (health.mailDomainVerified !== true) fail("sender domain is not verified in Resend; signup codes will not send");
}

const quoteResponse = await get(`${api}/v1/payments/quote?purpose=requirement_posting`);
let quote = null;
try {
  quote = JSON.parse(quoteResponse.text);
} catch {
  fail("quote was not JSON");
}
if (quoteResponse.status !== 200 || quote?.charge !== false) fail("payment quote was not a no-charge response");
else console.log(`ok quote amount=${quote.amount} currency=${quote.currency} checkout=${quote.checkout} charge=false`);

const browser = await chromium.launch();
try {
  for (const viewport of [
    { width: 390, height: 844, name: "phone" },
    { width: 1280, height: 800, name: "desktop" },
  ]) {
    const page = await browser.newPage({ viewport });
    await page.goto(site, { waitUntil: "networkidle" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) fail(`${viewport.name} homepage overflow ${overflow}px`);
    else console.log(`ok ${viewport.name} homepage`);
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${site}/signin`, { waitUntil: "networkidle" });
  await page.fill("#email", "dummy");
  await page.fill("#password", "dummy");
  const terms = page.locator("input[type=checkbox]").first();
  if (await terms.count()) await terms.check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/app/, { timeout: 15000 });
  const labelled = await page
    .waitForFunction(() => /demo data/i.test(document.body.innerText), null, { timeout: 10000 })
    .then(() => true, () => false);
  if (!labelled) fail("dummy login did not stay in the labelled demo workspace");
  else console.log("ok dummy login");
  await page.close();
} catch (error) {
  fail(error instanceof Error ? error.message : "browser check failed");
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`${failures.length} smoke check(s) failed`);
  process.exit(1);
}
console.log("production smoke passed");
