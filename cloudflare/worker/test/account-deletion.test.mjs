import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ACCOUNT_DELETION_PHRASE, deleteAccount, isFixtureAccount } from "../src/accountDeletion.js";
import { issueSession } from "../src/auth.js";
import { storePrivateFile } from "../src/files.js";
import worker from "../src/index.js";
import { bytesToHex, hashPassword } from "../src/pure.js";

const schemaDir = join(dirname(fileURLToPath(import.meta.url)), "../../d1");
const NOW = "2026-10-14T00:00:00.000Z";
const PHRASE = "DELETE MY OKAVO ACCOUNT";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString("base64");

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

async function insertAccount(db, { id, email, role, name, password = "password12" }) {
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await hashPassword(password, salt);
  await db
    .prepare(
      `INSERT INTO profiles (
         id, email, password_hash, password_salt, role, full_name, country_code, timezone,
         email_verified_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'IN', 'Asia/Kolkata', ?, ?, ?)`,
    )
    .bind(id, email, hash, salt, role, name, NOW, NOW, NOW)
    .run();
  if (role === "developer") {
    await db
      .prepare(
        `INSERT INTO developer_profiles (
           profile_id, headline, bio, hourly_rate_usd, bidding_unlocked_at, created_at, updated_at
         ) VALUES (?, 'Builder', 'Reach me there', 80, ?, ?, ?)`,
      )
      .bind(id, NOW, NOW, NOW)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO buyer_profiles (profile_id, organization_name, website, created_at, updated_at)
         VALUES (?, ?, 'https://buyer.example', ?, ?)`,
      )
      .bind(id, `${name} Org`, NOW, NOW)
      .run();
  }
}

async function rejectStatus(fn, status) {
  await assert.rejects(fn, (error) => {
    assert.equal(error.status, status);
    return true;
  });
}

test("deletion phrase matches the mobile constant", () => {
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../../packages/core/src/account.ts"),
    "utf8",
  );
  assert.match(source, /export const ACCOUNT_DELETION_PHRASE = "DELETE MY OKAVO ACCOUNT"/);
  assert.equal(ACCOUNT_DELETION_PHRASE, PHRASE);
  assert.equal(isFixtureAccount({ email: "solo@okavo.org" }), false);
  assert.equal(isFixtureAccount({ email: "dummy" }), true);
  assert.equal(isFixtureAccount({ email: "dummy@okavo.org" }), true);
  assert.equal(isFixtureAccount({ email: "dummy.user@gmail.com" }), false);
  assert.equal(isFixtureAccount({ email: "buyer@okavo.test" }), true);
  assert.equal(isFixtureAccount({ email: "person@example.com" }), true);
});

test("wrong phrase or password leaves the account", async () => {
  const db = openDb();
  await insertAccount(db, { id: "keep-1", email: "keep@okavo.org", role: "buyer", name: "Keep Account" });
  const session = await issueSession(db, "keep-1");
  await rejectStatus(
    () => deleteAccount(db, {}, { id: "keep-1" }, { password: "password12", confirmation: "delete my okavo account" }),
    400,
  );
  await rejectStatus(
    () => deleteAccount(db, {}, { id: "keep-1" }, { password: "password12", confirmation: "DELETE  MY OKAVO ACCOUNT" }),
    400,
  );
  await rejectStatus(
    () => deleteAccount(db, {}, { id: "keep-1" }, { password: "wrong-password", confirmation: `  ${PHRASE}  ` }),
    401,
  );
  const profile = await db.prepare("SELECT email FROM profiles WHERE id = ?").bind("keep-1").first();
  assert.equal(profile.email, "keep@okavo.org");
  const still = await db.prepare("SELECT token_hash FROM sessions WHERE user_id = ?").bind("keep-1").first();
  assert.ok(still);
  assert.equal(typeof session.access_token, "string");
});

test("fixture and demo accounts are refused", async () => {
  const db = openDb();
  const fixtures = [
    ["fix-test", "buyer@okavo.test"],
    ["fix-dummy", "dummy@okavo.org"],
    ["fix-example", "person@example.com"],
  ];
  for (const [id, email] of fixtures) {
    await insertAccount(db, { id, email, role: "buyer", name: "Fixture User" });
    await rejectStatus(
      () => deleteAccount(db, {}, { id }, { password: "password12", confirmation: PHRASE }),
      403,
    );
    const profile = await db.prepare("SELECT email FROM profiles WHERE id = ?").bind(id).first();
    assert.equal(profile.email, email);
  }
});

test("repeated password guesses are throttled", async () => {
  const db = openDb();
  await insertAccount(db, { id: "guess-1", email: "guess@okavo.org", role: "buyer", name: "Guess Account" });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await rejectStatus(
      () => deleteAccount(db, {}, { id: "guess-1" }, { password: "wrong-password", confirmation: PHRASE }),
      401,
    );
  }
  await rejectStatus(
    () => deleteAccount(db, {}, { id: "guess-1" }, { password: "password12", confirmation: PHRASE }),
    429,
  );
  const profile = await db.prepare("SELECT email FROM profiles WHERE id = ?").bind("guess-1").first();
  assert.equal(profile.email, "guess@okavo.org");
});

test("an account with no shared history is deleted", async () => {
  const db = openDb();
  await insertAccount(db, { id: "solo", email: "solo@okavo.org", role: "buyer", name: "Solo User" });
  await insertAccount(db, { id: "survivor", email: "survivor@okavo.org", role: "buyer", name: "Still Here" });
  await db
    .prepare(
      `INSERT INTO projects (
         id, buyer_id, title, category, outcome_statement, budget_min_cents, budget_max_cents, created_at, updated_at
       ) VALUES ('project-solo', 'solo', 'Draft', 'web', 'A private draft', 100, 200, ?, ?)`,
    )
    .bind(NOW, NOW)
    .run();
  await db
    .prepare(
      `INSERT INTO email_codes (email, purpose, code_hash, expires_at, created_at)
       VALUES ('solo@okavo.org', 'verify', 'abc', ?, ?)`,
    )
    .bind(NOW, NOW)
    .run();
  const stored = await storePrivateFile(db, { ownerId: "solo", purpose: "payment_proof", mime: "image/jpeg", data: JPEG }, {});
  const session = await issueSession(db, "solo");
  const response = await worker.fetch(
    new Request("https://okavo-api.example/v1/auth/account/delete", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ password: "password12", confirmation: `  ${PHRASE}  ` }),
    }),
    { DB: db },
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, mode: "deleted" });
  assert.equal(await db.prepare("SELECT id FROM profiles WHERE id = 'solo'").first(), null);
  assert.equal(await db.prepare("SELECT id FROM projects WHERE id = 'project-solo'").first(), null);
  assert.equal(await db.prepare("SELECT email FROM email_codes WHERE email = 'solo@okavo.org'").first(), null);
  assert.equal(await db.prepare("SELECT token_hash FROM sessions WHERE user_id = 'solo'").first(), null);
  const chunks = await db.prepare("SELECT COUNT(*) AS n FROM file_chunks WHERE file_id = ?").bind(stored.id).first();
  assert.equal(Number(chunks.n), 0);
  const file = await db.prepare("SELECT deleted_at FROM files WHERE id = ?").bind(stored.id).first();
  assert.ok(file.deleted_at);
  const survivor = await db.prepare("SELECT email FROM profiles WHERE id = 'survivor'").first();
  assert.equal(survivor.email, "survivor@okavo.org");

  const me = await worker.fetch(
    new Request("https://okavo-api.example/v1/me", { headers: { authorization: `Bearer ${session.access_token}` } }),
    { DB: db },
  );
  assert.equal(me.status, 401);
  const unauthenticated = await worker.fetch(
    new Request("https://okavo-api.example/v1/auth/account/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "password12", confirmation: PHRASE }),
    }),
    { DB: db },
  );
  assert.equal(unauthenticated.status, 401);

  const login = await worker.fetch(
    new Request("https://okavo-api.example/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "survivor@okavo.org", password: "password12" }),
    }),
    { DB: db },
  );
  const loggedIn = await login.json();
  assert.equal(login.status, 200);
  assert.equal(typeof loggedIn.access_token, "string");
  assert.equal(loggedIn.user.email, "survivor@okavo.org");
});

test("a contract is kept and the person is anonymized", async () => {
  const db = openDb();
  await insertAccount(db, { id: "dev-1", email: "dev.longname@okavo.org", role: "developer", name: "Dev Longname" });
  await insertAccount(db, { id: "buyer-1", email: "buyer.keep@okavo.org", role: "buyer", name: "Buyer Keep" });
  await db
    .prepare(
      `INSERT INTO projects (
         id, buyer_id, title, category, outcome_statement, budget_min_cents, budget_max_cents, created_at, updated_at
       ) VALUES ('project-1', 'buyer-1', 'Site', 'web', 'Ship a booking page', 100, 200, ?, ?)`,
    )
    .bind(NOW, NOW)
    .run();
  await db
    .prepare(
      `INSERT INTO contracts (id, project_id, buyer_id, developer_id, lock_reference, created_at, updated_at)
       VALUES ('contract-1', 'project-1', 'buyer-1', 'dev-1', 'lock-1', ?, ?)`,
    )
    .bind(NOW, NOW)
    .run();
  await db
    .prepare(
      `INSERT INTO message_threads (id, project_id, buyer_id, developer_id, subject, last_message_at, created_at)
       VALUES ('thread-1', 'project-1', 'buyer-1', 'dev-1', 'Build', ?, ?)`,
    )
    .bind(NOW, NOW)
    .run();
  await db
    .prepare("INSERT INTO messages (id, thread_id, sender_id, body, created_at) VALUES ('msg-dev', 'thread-1', 'dev-1', ?, ?)")
    .bind("I am dev.longname@okavo.org", NOW)
    .run();
  await db
    .prepare("INSERT INTO messages (id, thread_id, sender_id, body, created_at) VALUES ('msg-buyer', 'thread-1', 'buyer-1', ?, ?)")
    .bind("Please write to dev.longname@okavo.org today", NOW)
    .run();
  await db
    .prepare(
      `INSERT INTO notifications (id, profile_id, kind, title, body, created_at)
       VALUES ('note-1', 'buyer-1', 'message', 'Dev Longname sent a message', 'hello', ?)`,
    )
    .bind(NOW)
    .run();
  await db
    .prepare(
      `INSERT INTO audit_events (id, actor_id, entity_type, entity_id, action, detail, created_at)
       VALUES ('audit-1', 'dev-1', 'profile', 'dev-1', 'login', ?, ?)`,
    )
    .bind(JSON.stringify({ email: "dev.longname@okavo.org" }), NOW)
    .run();
  await db
    .prepare(
      `INSERT INTO email_codes (email, purpose, code_hash, expires_at, created_at)
       VALUES ('dev.longname@okavo.org', 'recovery', 'abc', ?, ?)`,
    )
    .bind(NOW, NOW)
    .run();
  const stored = await storePrivateFile(
    db,
    { ownerId: "dev-1", purpose: "identity_document", mime: "image/jpeg", data: JPEG },
    {},
  );
  await db
    .prepare(
      `INSERT INTO identity_verifications (
         id, developer_id, document_type, document_country, document_storage_path, created_at
       ) VALUES ('id-1', 'dev-1', 'passport', 'IN', ?, ?)`,
    )
    .bind(stored.id, NOW)
    .run();
  await db
    .prepare(
      `INSERT INTO payments (
         id, profile_id, purpose, status, amount_cents, provider, payer_reference, proof_storage_path, created_at, updated_at
       ) VALUES ('pay-1', 'dev-1', 'bidding_membership', 'paid', 89900, 'external', 'secret-ref', ?, ?, ?)`,
    )
    .bind(stored.id, NOW, NOW)
    .run();
  await db
    .prepare(
      `INSERT INTO build_exams (
         id, developer_id, brief_id, started_at, due_at, github_url, live_url, developer_reply, normalized_repo_url, created_at
       ) VALUES ('exam-1', 'dev-1', 'brief-mini-booking', ?, ?, 'https://github.com/secret/repo', 'https://secret.example', 'my reply', 'https://github.com/secret/repo', ?)`,
    )
    .bind(NOW, NOW, NOW)
    .run();
  await db
    .prepare(
      `INSERT INTO interview_assessments (id, developer_id, score_security, created_at)
       VALUES ('assess-1', 'dev-1', 3, ?)`,
    )
    .bind(NOW)
    .run();
  await issueSession(db, "dev-1");

  const result = await deleteAccount(db, {}, { id: "dev-1" }, { password: "password12", confirmation: PHRASE });
  assert.deepEqual(result, { ok: true, mode: "anonymized" });

  const profile = await db.prepare("SELECT email, full_name, country_code, timezone FROM profiles WHERE id = 'dev-1'").first();
  assert.equal(profile.email, "deleted.dev-1@deleted.okavo.invalid");
  assert.equal(profile.full_name, "Deleted account");
  assert.equal(profile.country_code, null);
  assert.equal(profile.timezone, null);
  const secrets = await db.prepare("SELECT password_hash, password_salt FROM profiles WHERE id = 'dev-1'").first();
  assert.notEqual(await hashPassword("password12", secrets.password_salt), secrets.password_hash);
  const developer = await db
    .prepare("SELECT headline, bio, hourly_rate_usd, bidding_unlocked_at, blocked_at FROM developer_profiles WHERE profile_id = 'dev-1'")
    .first();
  assert.equal(developer.headline, "");
  assert.equal(developer.bio, null);
  assert.equal(developer.hourly_rate_usd, null);
  assert.equal(developer.bidding_unlocked_at, null);
  assert.ok(developer.blocked_at);

  const contract = await db.prepare("SELECT buyer_id, developer_id FROM contracts WHERE id = 'contract-1'").first();
  assert.equal(contract.buyer_id, "buyer-1");
  assert.equal(contract.developer_id, "dev-1");
  const buyer = await db.prepare("SELECT email, full_name FROM profiles WHERE id = 'buyer-1'").first();
  assert.equal(buyer.email, "buyer.keep@okavo.org");
  assert.equal(buyer.full_name, "Buyer Keep");
  assert.equal((await db.prepare("SELECT body FROM messages WHERE id = 'msg-dev'").first()).body, "[deleted]");
  assert.equal(
    (await db.prepare("SELECT body FROM messages WHERE id = 'msg-buyer'").first()).body,
    "Please write to [deleted] today",
  );
  assert.equal((await db.prepare("SELECT title FROM notifications WHERE id = 'note-1'").first()).title, "[deleted] sent a message");
  const audit = await db.prepare("SELECT detail FROM audit_events WHERE id = 'audit-1'").first();
  assert.equal(audit.detail.includes("dev.longname@okavo.org"), false);
  assert.equal(await db.prepare("SELECT token_hash FROM sessions WHERE user_id = 'dev-1'").first(), null);
  assert.equal(await db.prepare("SELECT email FROM email_codes WHERE email = 'dev.longname@okavo.org'").first(), null);
  assert.equal(Number((await db.prepare("SELECT COUNT(*) AS n FROM file_chunks WHERE file_id = ?").bind(stored.id).first()).n), 0);
  const identity = await db.prepare("SELECT document_storage_path, document_type FROM identity_verifications WHERE id = 'id-1'").first();
  assert.equal(identity.document_storage_path, "[purged]");
  assert.equal(identity.document_type, "removed");
  const payment = await db.prepare("SELECT status, amount_cents, proof_storage_path, payer_reference FROM payments WHERE id = 'pay-1'").first();
  assert.equal(payment.status, "paid");
  assert.equal(payment.amount_cents, 89900);
  assert.equal(payment.proof_storage_path, "[purged]");
  assert.equal(payment.payer_reference, null);
  const exam = await db.prepare("SELECT github_url, live_url, developer_reply FROM build_exams WHERE id = 'exam-1'").first();
  assert.equal(exam.github_url, null);
  assert.equal(exam.live_url, null);
  assert.equal(exam.developer_reply, null);
  assert.equal(await db.prepare("SELECT id FROM interview_assessments WHERE id = 'assess-1'").first(), null);
  assert.equal((await db.prepare("SELECT title FROM projects WHERE id = 'project-1'").first()).title, "Site");

  const login = await worker.fetch(
    new Request("https://okavo-api.example/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "dev.longname@okavo.org", password: "password12" }),
    }),
    { DB: db },
  );
  assert.equal(login.status, 401);
});

test("another developer's bid keeps the buyer project", async () => {
  const db = openDb();
  await insertAccount(db, { id: "buyer-2", email: "buyer.longname@okavo.org", role: "buyer", name: "Buyer Longname" });
  await insertAccount(db, { id: "dev-2", email: "dev.keep@okavo.org", role: "developer", name: "Dev Keep" });
  await db
    .prepare(
      `INSERT INTO projects (
         id, buyer_id, title, category, outcome_statement, budget_min_cents, budget_max_cents, created_at, updated_at
       ) VALUES ('project-2', 'buyer-2', 'Site', 'web', 'Ship a booking page', 100, 200, ?, ?)`,
    )
    .bind(NOW, NOW)
    .run();
  await db
    .prepare(
      `INSERT INTO bids (id, project_id, developer_id, amount_cents, delivery_weeks, message, created_at, updated_at)
       VALUES ('bid-2', 'project-2', 'dev-2', 1000, 4, 'I can build this', ?, ?)`,
    )
    .bind(NOW, NOW)
    .run();

  const result = await deleteAccount(db, {}, { id: "buyer-2" }, { password: "password12", confirmation: PHRASE });
  assert.deepEqual(result, { ok: true, mode: "anonymized" });
  const project = await db.prepare("SELECT buyer_id, title FROM projects WHERE id = 'project-2'").first();
  assert.equal(project.buyer_id, "buyer-2");
  assert.equal(project.title, "Site");
  const bid = await db.prepare("SELECT developer_id, message FROM bids WHERE id = 'bid-2'").first();
  assert.equal(bid.developer_id, "dev-2");
  assert.equal(bid.message, "I can build this");
  const buyer = await db.prepare("SELECT email, full_name FROM profiles WHERE id = 'buyer-2'").first();
  assert.equal(buyer.email, "deleted.buyer-2@deleted.okavo.invalid");
  assert.equal(buyer.full_name, "Deleted account");
  const org = await db.prepare("SELECT organization_name, website FROM buyer_profiles WHERE profile_id = 'buyer-2'").first();
  assert.equal(org.organization_name, "Deleted account");
  assert.equal(org.website, null);
  const developer = await db.prepare("SELECT email FROM profiles WHERE id = 'dev-2'").first();
  assert.equal(developer.email, "dev.keep@okavo.org");
});

test("a message thread alone is not cascade-deleted", async () => {
  const db = openDb();
  await insertAccount(db, { id: "buyer-3", email: "thread.buyer@okavo.org", role: "buyer", name: "Thread Buyer" });
  await insertAccount(db, { id: "dev-3", email: "thread.dev@okavo.org", role: "developer", name: "Thread Dev" });
  await db
    .prepare(
      `INSERT INTO message_threads (id, buyer_id, developer_id, subject, last_message_at, created_at)
       VALUES ('thread-3', 'buyer-3', 'dev-3', 'Hello', ?, ?)`,
    )
    .bind(NOW, NOW)
    .run();
  await db
    .prepare("INSERT INTO messages (id, thread_id, sender_id, body, created_at) VALUES ('msg-3', 'thread-3', 'buyer-3', 'private note', ?)")
    .bind(NOW)
    .run();
  const result = await deleteAccount(db, {}, { id: "buyer-3" }, { password: "password12", confirmation: PHRASE });
  assert.equal(result.mode, "anonymized");
  assert.equal((await db.prepare("SELECT email FROM profiles WHERE id = 'buyer-3'").first()).email, "deleted.buyer-3@deleted.okavo.invalid");
  assert.equal((await db.prepare("SELECT id FROM message_threads WHERE id = 'thread-3'").first()).id, "thread-3");
  assert.equal((await db.prepare("SELECT body FROM messages WHERE id = 'msg-3'").first()).body, "[deleted]");
  assert.equal((await db.prepare("SELECT email FROM profiles WHERE id = 'dev-3'").first()).email, "thread.dev@okavo.org");
});
