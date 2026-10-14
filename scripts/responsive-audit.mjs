#!/usr/bin/env node
/**
 * Phone, tablet, and desktop audit for Okavo.
 *
 *   npm run build
 *   node scripts/responsive-audit.mjs
 *   node scripts/responsive-audit.mjs --base http://127.0.0.1:4173
 *
 * Uses fixture sessions in sessionStorage (the same shape as demoSignIn).
 * The dummy buyer is still signed in through the form once. No Razorpay
 * charge is created. A hosted payment link is not created; the return
 * page is opened with an unsigned cancelled query and must refuse it.
 */

import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "tmp", "responsive");

const VIEWPORTS = [
  { width: 390, height: 667, name: "390x667" },
  { width: 390, height: 844, name: "390x844" },
  { width: 393, height: 852, name: "393x852" },
  { width: 768, height: 1024, name: "768x1024" },
  { width: 820, height: 1180, name: "820x1180" },
  { width: 1024, height: 768, name: "1024x768" },
  { width: 1440, height: 900, name: "1440x900" },
];

/** Landscape pair of the smallest phone. Not a substitute for the list above. */
const ORIENTATION = { width: 667, height: 390, name: "390x667-landscape" };

const PUBLIC_ROUTES = [
  "/",
  "/how-it-works",
  "/example",
  "/guarantee",
  "/security",
  "/faq",
  "/about",
  "/terms",
  "/privacy",
  "/signin",
  "/signin?recovery=1",
  "/signin?verify=1",
];

const BUYER_ROUTES = [
  "/app",
  "/app/new",
  "/app/developers",
  "/app/developers/d1",
  "/app/project/p1",
  "/app/contracts",
  "/app/contract/p1",
  "/app/payments",
  "/app/payments/return",
  "/app/payments/return?razorpay_payment_link_id=plink_audit&razorpay_payment_link_status=cancelled",
  "/app/messages",
  "/app/notifications",
];

const DEVELOPER_ROUTES = [
  "/app",
  "/app/project/p1",
  "/app/bids",
  "/app/contracts",
  "/app/contract/p1",
  "/app/earnings",
  "/app/messages",
  "/app/verification",
  "/app/notifications",
];

const ADMIN_ROUTES = [
  "/app",
  "/app/traffic",
  "/app/audit",
  "/app/exams",
  "/app/blocks",
  "/app/operations",
  "/app/verifications",
  "/app/contracts",
  "/app/messages",
  "/app/notifications",
];

const ORIENTATION_ROUTES = {
  guest: ["/", "/example", "/signin", "/signin?recovery=1", "/signin?verify=1"],
  buyer: ["/app", "/app/new", "/app/contracts", "/app/messages", "/app/payments/return"],
  developer: ["/app", "/app/verification", "/app/earnings", "/app/messages"],
  admin: ["/app", "/app/exams", "/app/verifications", "/app/contracts"],
};

const SESSIONS = {
  buyer: { role: "buyer", displayName: "Dummy Buyer" },
  developer: { role: "developer", displayName: "Fixture Developer" },
  admin: { role: "admin", displayName: "Fixture Admin" },
};

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return "";
  return process.argv[index + 1] || "";
}

function waitForServer(url, child) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (child.exitCode !== null) {
        reject(new Error("preview server exited before it was ready"));
        return;
      }
      try {
        const response = await fetch(url, { redirect: "manual" });
        if (response.status < 500) {
          resolve();
          return;
        }
      } catch {
        // not listening yet
      }
      if (Date.now() - started > 20000) {
        reject(new Error("preview server did not answer on " + url));
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  });
}

async function productionReachability(problems) {
  const checks = [
    ["https://okavo.org/", 200],
    ["https://www.okavo.org/", 300],
  ];
  const lines = [];
  for (const [url, expect] of checks) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      const location = response.headers.get("location") || "";
      lines.push(`${url} ${response.status} ${location}`.trim());
      if (url.includes("www.")) {
        const redirected = response.status >= 300 && response.status < 400;
        const toApex = location.startsWith("https://okavo.org");
        if (!redirected || !toApex) {
          problems.push(
            `www did not redirect to the apex (${response.status} ${location})`
          );
        }
      } else if (response.status !== expect) {
        problems.push(`apex returned HTTP ${response.status}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lines.push(`${url} ERROR ${message}`);
      problems.push(`${url} unreachable: ${message}`);
    }
  }
  return lines;
}

function layoutFacts() {
  const width = window.innerWidth;
  const touch = width <= 1180;
  const offenders = [];
  let overflow = 0;

  function clipped(el) {
    let parent = el.parentElement;
    while (
      parent &&
      parent !== document.body &&
      parent !== document.documentElement
    ) {
      const overflowX = getComputedStyle(parent).overflowX;
      if (
        overflowX === "auto" ||
        overflowX === "scroll" ||
        overflowX === "hidden" ||
        overflowX === "clip"
      ) {
        const box = parent.getBoundingClientRect();
        if (box.left >= -1 && box.right <= width + 1) return true;
      }
      parent = parent.parentElement;
    }
    return false;
  }

  const drawerOpen = Boolean(document.querySelector(".app.nav-open"));
  for (const el of document.querySelectorAll("body *")) {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;
    if (!drawerOpen && el.closest(".sidebar")) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const extra = Math.max(rect.right - width, -rect.left, 0);
    if (extra <= 2 || clipped(el)) continue;
    if (extra > overflow) overflow = Math.round(extra);
    if (offenders.length < 4) {
      offenders.push(
        `${el.tagName.toLowerCase()}.${el.getAttribute("class") || ""}`.slice(0, 80)
      );
    }
  }

  const smallTargets = [];
  const smallType = [];
  if (touch) {
    const controls = document.querySelectorAll(
      "button, a.btn, .menu-toggle, .side-link, .tab, .role-option, .option-card, .thread-item, .link-button"
    );
    for (const el of controls) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      if (centerX < 0 || centerX > width || centerY < 0 || centerY > window.innerHeight) {
        continue;
      }
      if (rect.height >= 44) continue;
      if (smallTargets.length < 5) {
        smallTargets.push(
          `${el.tagName.toLowerCase()}.${el.getAttribute("class") || ""} ${Math.round(rect.width)}x${Math.round(rect.height)}`
        );
      }
    }

    const fields = document.querySelectorAll("input, select, textarea");
    for (const el of fields) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      const type = (el.getAttribute("type") || "text").toLowerCase();
      if (["checkbox", "radio", "hidden", "button", "submit", "image"].includes(type)) {
        const label = el.closest("label");
        const box = (label || el).getBoundingClientRect();
        if (box.height > 0 && box.height < 44 && smallTargets.length < 5) {
          smallTargets.push(`label ${Math.round(box.width)}x${Math.round(box.height)}`);
        }
        continue;
      }
      const font = Number.parseFloat(style.fontSize);
      if (font < 16 && smallType.length < 5) {
        smallType.push(`${el.id || type} ${font}px`);
      }
    }
  }

  const tables = [];
  if (width <= 1000) {
    for (const card of document.querySelectorAll(".card:has(table), .ex-surface:has(table)")) {
      const hint = getComputedStyle(card, "::before").content || "";
      const overflowX = getComputedStyle(card).overflowX;
      if (!hint.includes("Swipe") || (overflowX !== "auto" && overflowX !== "scroll")) {
        tables.push(overflowX + " " + hint.slice(0, 40));
      }
    }
  }

  const body = getComputedStyle(document.body);
  return {
    overflow,
    offenders,
    smallTargets,
    smallType,
    tables,
    bodyOverflowX: body.overflowX,
    scrollLocked: document.body.classList.contains("scroll-lock"),
    loading: Boolean(document.querySelector(".load-screen")),
    text: document.body.innerText.replace(/\s+/g, " ").slice(0, 500),
  };
}

async function settle(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForFunction(
    () => {
      const loading = document.querySelector(".load-screen");
      const ready = document.querySelector(
        "h1, .hero, .page-hero, .auth-card, .topbar, .side-nav"
      );
      return Boolean(ready) && !loading;
    },
    undefined,
    { timeout: 15000 }
  );
  await page.waitForTimeout(100);
}

async function inspect(page, label, problems) {
  const facts = await page.evaluate(layoutFacts);
  if (facts.loading) problems.push(`${label} still on the loading screen`);
  if (facts.overflow > 2) {
    problems.push(
      `${label} overflow ${facts.overflow}px (${facts.offenders.join(", ")})`
    );
  }
  if (!facts.scrollLocked && facts.bodyOverflowX !== "visible") {
    problems.push(`${label} body overflow-x is ${facts.bodyOverflowX}`);
  }
  for (const hit of facts.smallTargets) problems.push(`${label} touch ${hit}`);
  for (const field of facts.smallType) problems.push(`${label} input ${field}`);
  for (const table of facts.tables) problems.push(`${label} table affordance ${table}`);
  return facts;
}

async function openDrawer(page, label, problems) {
  const toggle = page.locator(".menu-toggle").first();
  if (!(await toggle.count()) || !(await toggle.isVisible())) return;
  await toggle.click();
  try {
    await page.waitForFunction(
      () => {
        const el =
          document.querySelector(".app.nav-open .sidebar") ||
          document.getElementById("market-menu");
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 20 && rect.left >= -1 && rect.left < window.innerWidth;
      },
      undefined,
      { timeout: 2000 }
    );
  } catch {
    problems.push(`${label} drawer did not open`);
    return;
  }
  const placed = await page.evaluate(() => {
    const el =
      document.querySelector(".app.nav-open .sidebar") ||
      document.getElementById("market-menu");
    if (!el) return { ok: false, reason: "missing" };
    const rect = el.getBoundingClientRect();
    const x = Math.min(Math.max(rect.left + 20, 8), window.innerWidth - 8);
    const y = Math.min(Math.max(rect.top + 70, 8), window.innerHeight - 8);
    const hit = document.elementFromPoint(x, y);
    const inside = Boolean(hit && (hit.closest(".sidebar") || hit.closest("#market-menu")));
    return {
      ok: rect.left >= -1 && rect.left < window.innerWidth && inside,
      left: Math.round(rect.left),
      locked: document.body.classList.contains("scroll-lock"),
      bodyOverflow: getComputedStyle(document.body).overflowX,
    };
  });
  if (!placed.ok) problems.push(`${label} drawer clipped or offscreen (${placed.left})`);
  if (!placed.locked) problems.push(`${label} drawer did not lock scroll`);
  const facts = await page.evaluate(layoutFacts);
  if (facts.overflow > 2) {
    problems.push(`${label} drawer overflow ${facts.overflow}px`);
  }
  const appClose = page.locator(".menu-close");
  if ((await appClose.count()) && (await appClose.isVisible())) {
    await appClose.click();
  } else {
    await page.locator('.menu-toggle[aria-expanded="true"]').click();
  }
  await page.waitForTimeout(100);
}

async function runWizard(page, label, problems) {
  await page.locator(".wizard-foot .btn").last().click();
  const outcome = page.locator("#outcome");
  await outcome.waitFor({ state: "visible", timeout: 4000 });
  await outcome.fill("Customers can order bread and pay for pickup.");
  await page.locator(".wizard-foot .btn").last().click();
  await page.locator("#excluded").fill("Delivery is out of scope.");
  await page.locator(".wizard-foot .btn").last().click();
  await page.locator("#min").fill("2000");
  await page.locator("#max").fill("4000");
  await page.locator("#monthly").fill("40");
  await page.locator("#weeks").fill("6");
  await page.locator(".wizard-foot .btn").last().click();
  const publish = page.locator(".wizard-foot .btn").last();
  const text = (await publish.innerText()).replace(/\s+/g, " ");
  if (!/no charge/i.test(text)) {
    problems.push(`${label} publish button was "${text}"`);
  }
  const facts = await inspect(page, label + " wizard", problems);
  return facts;
}

function watchPayment(page, problems, label) {
  page.on("request", (request) => {
    const url = request.url();
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      host = "";
    }
    const method = request.method();
    if (/(^|\.)razorpay\.com$/i.test(host)) {
      problems.push(`${label} called Razorpay ${method} ${url}`);
    }
    if (method !== "GET" && /\/v1\/payments|payment_links/i.test(url)) {
      problems.push(`${label} payment write ${method} ${url}`);
    }
  });
}

async function main() {
  const problems = [];
  const matrix = [];
  const reach = await productionReachability(problems);
  const baseArg = arg("--base");
  let preview = null;
  let base = baseArg.replace(/\/$/, "");

  if (!base) {
    const dist = join(ROOT, "apps/catalog/dist/index.html");
    if (!existsSync(dist)) {
      console.error("RESULT fail");
      console.error("Build the catalog first: npm run build");
      process.exitCode = 1;
      return;
    }
    base = "http://127.0.0.1:4173";
    preview = spawn(
      process.execPath,
      [
        join(ROOT, "node_modules/vite/bin/vite.js"),
        "preview",
        "--host",
        "127.0.0.1",
        "--port",
        "4173",
        "--strictPort",
      ],
      { cwd: join(ROOT, "apps/catalog"), stdio: "ignore" }
    );
    await waitForServer(base + "/", preview);
  }

  mkdirSync(SHOTS, { recursive: true });
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });

  async function walk(viewport, role, routes, extras) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: extras?.reducedMotion ? "reduce" : "no-preference",
    });
    await context.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session: null }),
      })
    );
    if (SESSIONS[role]) {
      await context.addInitScript((session) => {
        sessionStorage.setItem("okavo.demo.session", JSON.stringify(session));
      }, SESSIONS[role]);
    }
    const page = await context.newPage();
    watchPayment(page, problems, `${role} ${viewport.name}`);
    const logs = [];
    page.on("pageerror", (error) => {
      logs.push(error && error.message ? error.message : String(error));
    });
    page.on("console", (message) => {
      if (message.type() === "error") logs.push(message.text());
    });

    try {
      for (const route of routes) {
        const label = `${role} ${route} @ ${viewport.name}`;
        const before = logs.length;
        const capture =
          extras?.hydration &&
          ((role === "guest" && route === "/") ||
            (role === "buyer" && route === "/app") ||
            (role === "guest" && route === "/signin"));
        let response = null;
        try {
          response = await page.goto(base + route, {
            waitUntil: "commit",
            timeout: 20000,
          });
        } catch (error) {
          problems.push(`${label} navigation: ${error.message}`);
          matrix.push({ role, route, viewport: viewport.name, result: "nav" });
          continue;
        }
        if (capture) {
          const file = `${role}-${route.replace(/[^\w]+/g, "-")}-${viewport.name}-hydration.png`;
          try {
            await page.screenshot({ path: join(SHOTS, file) });
          } catch {
            // A remote page can still be painting when CDP asks for the first
            // frame. The layout assertions below are authoritative; retry the
            // optional visual artifact after the page settles.
            await page.waitForTimeout(250);
            await page.screenshot({ path: join(SHOTS, file) }).catch(() => {});
          }
        }
        if (!response) problems.push(`${label} returned no response`);
        else if (response.status() >= 400) problems.push(`${label} HTTP ${response.status()}`);
        await settle(page);
        const facts = await inspect(page, label, problems);
        if (logs.length > before) {
          problems.push(`${label} console/page error: ${logs.slice(before).join(" | ")}`);
        }
        if (route === "/signin" && role === "guest") {
          const signup = page.getByRole("button", { name: "Create account" });
          if (await signup.count()) {
            await signup.click();
            await inspect(page, `${label} signup`, problems);
            matrix.push({
              role: "guest",
              route: "/signin#signup",
              viewport: viewport.name,
              result: "checked",
            });
          } else {
            problems.push(`${label} signup tab missing`);
          }
        }
        if (route === "/signin?recovery=1" && !/new password/i.test(facts.text)) {
          problems.push(`${label} recovery form missing`);
        }
        if (route === "/signin?verify=1" && !(await page.locator("#verifyCode").count())) {
          problems.push(`${label} verification code field missing`);
        }
        if (role === "buyer" && route === "/app") {
          const labelText = await page.locator("body").innerText();
          if (!/Principal\s*·\s*lifetime/i.test(labelText)) {
            problems.push(`${label} dummy buyer is not Principal lifetime`);
          }
        }
        if (role === "buyer" && route.startsWith("/app/payments/return")) {
          const returnText = await page.locator("body").innerText();
          if (!/no payment|sign in again|could not|nothing was marked paid|cancelled/i.test(returnText)) {
            problems.push(`${label} return copy missing`);
          }
        }
        if (role === "developer" && route === "/app/verification") {
          if (!(await page.locator("#doc").count())) problems.push(`${label} upload field missing`);
          if (!(await page.locator("#gh").count())) problems.push(`${label} exam field missing`);
          const verifyText = await page.locator("body").innerText();
          if (!/no charge/i.test(verifyText)) problems.push(`${label} membership is not no-charge`);
        }
        if (
          extras?.wizard &&
          role === "buyer" &&
          route === "/app/new" &&
          (viewport.name === "390x844" || viewport.name === "1440x900")
        ) {
          await runWizard(page, label, problems);
        }
        if (route === "/" || route === "/app") {
          await openDrawer(page, label, problems);
        }
        if (route === "/app/messages") {
          const threads = page.locator(".thread-item");
          if ((await threads.count()) > 1) await threads.nth(1).click();
          await inspect(page, label + " thread", problems);
        }
        matrix.push({ role, route, viewport: viewport.name, result: "checked" });
      }

      if (extras?.reducedMotion) {
        const reduced = await page.evaluate(() => {
          const probe = document.querySelector(".btn, a, button");
          const duration = probe ? getComputedStyle(probe).transitionDuration : "";
          return {
            scroll: getComputedStyle(document.documentElement).scrollBehavior,
            duration,
          };
        });
        const seconds = reduced.duration.split(",").map((part) => {
          const value = part.trim();
          if (value.endsWith("ms")) return Number.parseFloat(value) / 1000;
          return Number.parseFloat(value);
        });
        if (reduced.scroll !== "auto" || seconds.some((value) => value > 0.05)) {
          problems.push(
            `reduced motion still animates (scroll ${reduced.scroll}, duration ${reduced.duration})`
          );
        }
        matrix.push({
          role: "guest",
          route: "/",
          viewport: "390x844-reduced-motion",
          result: "checked",
        });
      }
    } finally {
      await context.close();
    }
  }

  try {
    const dummy = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await dummy.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session: null }),
      })
    );
    const dummyPage = await dummy.newPage();
    watchPayment(dummyPage, problems, "dummy login");
    await dummyPage.goto(base + "/signin", { waitUntil: "domcontentloaded" });
    await settle(dummyPage);
    await dummyPage.locator("#email").fill("dummy");
    await dummyPage.locator("#password").fill("dummy");
    await dummyPage.locator(".terms-check input").check();
    if (!(await dummyPage.getByRole("button", { name: "Continue" }).isEnabled())) {
      problems.push("dummy/dummy form is not ready to submit");
    }
    matrix.push({
      role: "buyer",
      route: "dummy/dummy form",
      viewport: "390x844",
      result: "checked",
    });
    await dummy.close();

    for (const viewport of VIEWPORTS) {
      await walk(viewport, "guest", PUBLIC_ROUTES, {
        hydration: viewport.name === "390x844",
        reducedMotion: false,
      });
      await walk(viewport, "buyer", BUYER_ROUTES, {
        wizard: true,
        hydration: viewport.name === "390x844",
      });
      await walk(viewport, "developer", DEVELOPER_ROUTES, {});
      await walk(viewport, "admin", ADMIN_ROUTES, {});
    }
    await walk(ORIENTATION, "guest", ORIENTATION_ROUTES.guest, {});
    await walk(ORIENTATION, "buyer", ORIENTATION_ROUTES.buyer, {});
    await walk(ORIENTATION, "developer", ORIENTATION_ROUTES.developer, {});
    await walk(ORIENTATION, "admin", ORIENTATION_ROUTES.admin, {});
    await walk(VIEWPORTS[1], "guest", ["/"], { reducedMotion: true });
  } finally {
    await browser.close();
    if (preview) preview.kill("SIGTERM");
  }

  console.log("production:");
  reach.forEach((line) => console.log("  " + line));
  console.log(
    "viewports: " +
      VIEWPORTS.map((item) => item.name).concat(ORIENTATION.name).join(", ")
  );
  console.log("matrix rows: " + matrix.length);
  const roles = ["guest", "buyer", "developer", "admin"];
  for (const role of roles) {
    const routes = [...new Set(matrix.filter((row) => row.role === role).map((row) => row.route))];
    console.log(`${role}: ${routes.join(", ")}`);
  }
  console.log("hydration screenshots: " + SHOTS);
  console.log("problems: " + problems.length);
  problems.forEach((line) => console.log("FAIL " + line));
  if (problems.length) {
    console.log("RESULT fail");
    process.exitCode = 1;
    return;
  }
  console.log("RESULT ok");
}

main().catch((error) => {
  console.error("RESULT fail");
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
