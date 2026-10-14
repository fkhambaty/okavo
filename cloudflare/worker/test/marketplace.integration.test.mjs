import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { changePassword } from "../src/auth.js";
import { purgeExpiredIdentityFiles, storePrivateFile } from "../src/files.js";
import { HttpError } from "../src/http.js";
import worker from "../src/index.js";
import {
  awardBid,
  liquidity,
  lockProject,
  placeBid,
  publishProject,
  raiseDispute,
} from "../src/marketplace.js";
import { quoteFee, reconcilePending } from "../src/payments.js";

const schemaDir = join(dirname(fileURLToPath(import.meta.url)), "../../d1");

function openDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const name of ["0001_okavo.sql", "0002_files_exams_checkout.sql", "0003_storage_audit.sql"]) {
    sqlite.exec(readFileSync(join(schemaDir, name), "utf8"));
  }
  return {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      const bound = (args) => ({
        async run() {
          const info = statement.run(...args);
          return { meta: { changes: Number(info.changes || 0) } };
        },
        async first() {
          return statement.get(...args) ?? null;
        },
        async all() {
          return { results: statement.all(...args) };
        },
      });
      return {
        bind(...args) {
          return bound(args);
        },
        run: () => bound([]).run(),
        first: () => bound([]).first(),
        all: () => bound([]).all(),
      };
    },
  };
}

const NOW = "2026-10-13T00:00:00.000Z";

test("D1 daily quota exhaustion returns a clear retryable response", async () => {
  const db = {
    prepare() {
      throw new Error("D1_ERROR: Your account has exceeded D1's free tier daily row write limit.");
    },
  };
  const response = await worker.fetch(
    new Request("https://api.okavo.org/v1/auth/signup", {
      method: "POST",
      headers: { origin: "https://okavo.org", "content-type": "application/json" },
      body: JSON.stringify({ email: "quota@example.com", password: "password12" }),
    }),
    { DB: db },
  );
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.match(body.error, /storage allowance/i);
  assert.match(body.error, /Nothing was charged/i);
});

function person(id, role) {
  return {
    id,
    role,
    email: `${id}@example.test`,
    full_name: id,
    email_verified_at: NOW,
    terms_accepted_at: NOW,
  };
}

async function insertProfile(db, user, kind) {
  await db
    .prepare(
      `INSERT INTO profiles (
         id, email, password_hash, password_salt, role, full_name, email_verified_at, terms_accepted_at, created_at, updated_at
       ) VALUES (?, ?, 'hash', 'salt', ?, ?, ?, ?, ?, ?)`,
    )
    .bind(user.id, user.email, user.role, user.full_name, NOW, NOW, NOW, NOW)
    .run();
  if (kind === "buyer") {
    await db
      .prepare("INSERT INTO buyer_profiles (profile_id, organization_name, created_at, updated_at) VALUES (?, 'Buyer', ?, ?)")
      .bind(user.id, NOW, NOW)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO developer_profiles (
           profile_id, identity_status, interview_status, bidding_unlocked_at, blocked_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        user.id,
        user.identity_status || "not_started",
        user.interview_status || "not_started",
        user.bidding_unlocked_at || null,
        user.blocked_at || null,
        NOW,
        NOW,
      )
      .run();
  }
}

async function payPosting(db, profileId) {
  await db
    .prepare(
      `INSERT INTO payments (
         id, profile_id, purpose, status, amount_cents, currency, provider, paid_at, created_at, updated_at
       ) VALUES (?, ?, 'requirement_posting', 'paid', 9900, 'INR', 'razorpay', ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), profileId, NOW, NOW, NOW)
    .run();
}

const requirement = {
  title: "Booking page",
  category: "website",
  outcome: "A visitor can request a table and see a confirmation on screen.",
  budget_min_cents: 100000,
  budget_max_cents: 250000,
  timeline_weeks: 6,
};

async function expectStatus(promise, status) {
  await assert.rejects(promise, (error) => error instanceof HttpError && error.status === status);
}

test("a posting fee is consumed once and a second requirement is refused", async () => {
  const db = openDb();
  const buyer = person("buyer-1", "buyer");
  await insertProfile(db, buyer, "buyer");
  await expectStatus(publishProject(db, buyer, requirement), 402);
  await payPosting(db, buyer.id);
  const first = await publishProject(db, buyer, requirement);
  assert.ok(first.id);
  const payment = await db.prepare("SELECT consumed_at, project_id FROM payments WHERE profile_id = ?").bind(buyer.id).first();
  assert.equal(payment.project_id, first.id);
  assert.ok(payment.consumed_at);
  await expectStatus(publishProject(db, buyer, { ...requirement, title: "Second page" }), 402);
  const projects = await db.prepare("SELECT COUNT(*) AS count FROM projects").first();
  assert.equal(Number(projects.count), 1);
});

test("changing a password revokes every existing session", async () => {
  const db = openDb();
  const buyer = person("buyer-password", "buyer");
  await insertProfile(db, buyer, "buyer");
  await db
    .prepare("INSERT INTO sessions (token_hash, user_id, kind, expires_at, created_at) VALUES ('access', ?, 'access', ?, ?)")
    .bind(buyer.id, "2027-10-13T00:00:00.000Z", NOW)
    .run();
  await changePassword(db, buyer, { password: "new-password-123" });
  const sessions = await db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?").bind(buyer.id).first();
  assert.equal(Number(sessions.count), 0);
});

test("bids require identity, the exam, membership, and an unlocked account", async () => {
  const db = openDb();
  const buyer = person("buyer-2", "buyer");
  const developer = person("dev-1", "developer");
  await insertProfile(db, buyer, "buyer");
  await insertProfile(db, developer, "developer");
  await payPosting(db, buyer.id);
  const published = await publishProject(db, buyer, requirement);
  await lockProject(db, buyer, published.id, {});
  await expectStatus(placeBid(db, developer, published.id, { amount_cents: 150000, delivery_weeks: 4 }), 403);

  await db.prepare("UPDATE developer_profiles SET identity_status = 'approved' WHERE profile_id = ?").bind(developer.id).run();
  await expectStatus(placeBid(db, developer, published.id, { amount_cents: 150000, delivery_weeks: 4 }), 403);

  await db.prepare("UPDATE developer_profiles SET interview_status = 'approved' WHERE profile_id = ?").bind(developer.id).run();
  await expectStatus(placeBid(db, developer, published.id, { amount_cents: 150000, delivery_weeks: 4 }), 403);

  await db.prepare("UPDATE developer_profiles SET bidding_unlocked_at = ? WHERE profile_id = ?").bind(NOW, developer.id).run();
  await placeBid(db, developer, published.id, { amount_cents: 150000, delivery_weeks: 4 });

  await expectStatus(
    placeBid(db, { ...developer, terms_accepted_at: null }, published.id, { amount_cents: 150000, delivery_weeks: 4 }),
    403,
  );

  await db.prepare("UPDATE developer_profiles SET blocked_at = ? WHERE profile_id = ?").bind(NOW, developer.id).run();
  const other = person("dev-2", "developer");
  other.identity_status = "approved";
  other.interview_status = "approved";
  other.bidding_unlocked_at = NOW;
  other.blocked_at = NOW;
  await insertProfile(db, other, "developer");
  await expectStatus(placeBid(db, other, published.id, { amount_cents: 120000, delivery_weeks: 5 }), 403);
  await expectStatus(placeBid(db, buyer, published.id, { amount_cents: 120000, delivery_weeks: 5 }), 403);
});

test("hire fee, contract milestones, and disputes follow the attestation rules", async () => {
  const db = openDb();
  const buyer = person("buyer-3", "buyer");
  const developer = person("dev-3", "developer");
  developer.identity_status = "approved";
  developer.interview_status = "approved";
  developer.bidding_unlocked_at = NOW;
  const stranger = person("stranger", "buyer");
  await insertProfile(db, buyer, "buyer");
  await insertProfile(db, developer, "developer");
  await insertProfile(db, stranger, "buyer");
  await payPosting(db, buyer.id);
  const published = await publishProject(db, buyer, requirement);
  await lockProject(db, buyer, published.id, {});
  await placeBid(db, developer, published.id, { amount_cents: 200000, delivery_weeks: 8 });
  const bid = await db.prepare("SELECT id FROM bids WHERE developer_id = ?").bind(developer.id).first();
  await expectStatus(awardBid(db, buyer, bid.id), 402);

  await db
    .prepare(
      `INSERT INTO payments (
         id, profile_id, purpose, status, amount_cents, currency, provider, bid_id, paid_at, created_at, updated_at
       ) VALUES (?, ?, 'platform_fee', 'paid', 1980000, 'INR', 'razorpay', ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), buyer.id, bid.id, NOW, NOW, NOW)
    .run();
  await awardBid(db, buyer, bid.id);
  const project = await db.prepare("SELECT stage FROM projects WHERE id = ?").bind(published.id).first();
  assert.equal(project.stage, "hired");
  const contract = await db.prepare("SELECT id, developer_id, status FROM contracts WHERE project_id = ?").bind(published.id).first();
  assert.equal(contract.developer_id, developer.id);
  assert.equal(contract.status, "locked");
  const milestones = await db.prepare("SELECT COUNT(*) AS count FROM milestones WHERE contract_id = ?").bind(contract.id).first();
  assert.equal(Number(milestones.count), 3);

  await expectStatus(raiseDispute(db, stranger, published.id, { reason: "I am not on this contract" }), 403);
  await raiseDispute(db, buyer, published.id, { reason: "The delivered page missed the locked confirmation." });
  const disputed = await db.prepare("SELECT status FROM contracts WHERE id = ?").bind(contract.id).first();
  assert.equal(disputed.status, "disputed");

  const admin = person("admin-1", "admin");
  await insertProfile(db, admin, "buyer");
  const metrics = await liquidity(db, admin);
  assert.equal(metrics.verifiedBuyers >= 1, true);
  assert.equal(metrics.publishedRequirements, 1);
  assert.equal(metrics.lockedRequirements, 1);
  assert.equal(metrics.verifiedDevelopers, 1);
  assert.equal(metrics.bidCount, 1);
  assert.equal(metrics.hiredCount, 1);
  assert.equal(metrics.hireConversion, 1);
  assert.equal(metrics.disputeRate, 1);
  assert.equal(metrics.timeToFirstBidSamples, 1);
  assert.equal(metrics.reviewSla.identityFileRetentionDays, 90);
  assert.match(metrics.reviewSla.identity, /person reviews/);
});

test("payment quotes do not charge and reconciliation stays report-only by default", async () => {
  const db = openDb();
  const quote = quoteFee({ CHECKOUT_MODE: "hosted", RAZORPAY_PAYMENTS_ENABLED: "false" }, "requirement_posting");
  assert.equal(quote.charge, false);
  assert.equal(quote.checkout, "hosted");
  assert.equal(quote.amount, 9900);
  assert.match(quote.note, /nothing was charged/i);
  const modal = quoteFee({ CHECKOUT_MODE: "modal" }, "bidding_membership");
  assert.equal(modal.checkout, "modal");
  assert.equal(modal.charge, false);

  const buyer = person("buyer-4", "buyer");
  await insertProfile(db, buyer, "buyer");
  const old = "2026-10-01T00:00:00.000Z";
  await db
    .prepare(
      `INSERT INTO payments (
         id, profile_id, purpose, status, amount_cents, currency, provider, created_at, updated_at
       ) VALUES ('pay-old', ?, 'requirement_posting', 'pending', 9900, 'INR', 'razorpay', ?, ?)`,
    )
    .bind(buyer.id, old, old)
    .run();
  const report = await reconcilePending(db, { ALLOW_PAYMENT_RECONCILIATION: "true", CHECKOUT_MODE: "hosted" }, { apply: true });
  assert.equal(report.apply, false);
  assert.equal(report.settled, 0);
  assert.equal(report.charge, false);
  const still = await db.prepare("SELECT status FROM payments WHERE id = 'pay-old'").first();
  assert.equal(still.status, "pending");
});

test("identity files stay in D1 and retention writes a deletion audit", async () => {
  const db = openDb();
  const developer = person("dev-4", "developer");
  await insertProfile(db, developer, "developer");
  const stored = await storePrivateFile(db, {
    ownerId: developer.id,
    purpose: "identity_document",
    mime: "image/jpeg",
    data: "/9j/AA==",
  });
  assert.equal(stored.storage, "d1");
  const chunks = await db.prepare("SELECT COUNT(*) AS count FROM file_chunks WHERE file_id = ?").bind(stored.id).first();
  assert.equal(Number(chunks.count), 1);
  await db
    .prepare(
      `INSERT INTO identity_verifications (
         id, developer_id, status, document_type, document_country, document_storage_path, expires_at, created_at
       ) VALUES ('ver-1', ?, 'approved', 'passport', 'IN', ?, '2020-01-01T00:00:00.000Z', ?)`,
    )
    .bind(developer.id, stored.id, NOW)
    .run();
  const purged = await purgeExpiredIdentityFiles(db);
  assert.equal(purged, 1);
  const audit = await db.prepare("SELECT reason, storage_backend FROM deletion_audit WHERE file_id = ?").bind(stored.id).first();
  assert.equal(audit.reason, "identity_retention");
  assert.equal(audit.storage_backend, "d1");
  const row = await db.prepare("SELECT document_storage_path FROM identity_verifications WHERE id = 'ver-1'").first();
  assert.equal(row.document_storage_path, "[purged]");
});

test("an R2 binding is used only when the binding can store objects", async () => {
  const db = openDb();
  const objects = new Map();
  const env = {
    FILES: {
      async put(key, bytes) {
        objects.set(key, bytes);
      },
      async get(key) {
        const bytes = objects.get(key);
        return bytes ? { arrayBuffer: async () => bytes.buffer } : null;
      },
      async delete(key) {
        objects.delete(key);
      },
    },
  };
  const stored = await storePrivateFile(
    db,
    { ownerId: "owner", purpose: "payment_proof", mime: "image/jpeg", data: "/9j/AA==" },
    env,
  );
  assert.equal(stored.storage, "r2");
  assert.equal(objects.size, 1);
  const chunks = await db.prepare("SELECT COUNT(*) AS count FROM file_chunks WHERE file_id = ?").bind(stored.id).first();
  assert.equal(Number(chunks.count), 0);
  const disabled = await storePrivateFile(db, {
    ownerId: "owner",
    purpose: "payment_proof",
    mime: "image/jpeg",
    data: "/9j/AA==",
  });
  assert.equal(disabled.storage, "d1");
});
