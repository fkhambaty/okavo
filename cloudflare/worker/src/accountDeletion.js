import { consumeRateLimit } from "./auth.js";
import { deleteFile } from "./files.js";
import { HttpError } from "./http.js";
import { bytesToHex, hashPassword, nowIso, sha256 } from "./pure.js";

// Keep this identical to packages/core/src/account.ts. Worker tests do not import that package.
export const ACCOUNT_DELETION_PHRASE = "DELETE MY OKAVO ACCOUNT";

// buyer_profiles cascade into projects, and projects cascade into contracts and bids.
// Deleting a profile that still shares a marketplace record would erase the other party's
// contract. Those accounts stay in place with the name and email removed.
const TEXT_FIELDS = [
  ["reviews", "comment"],
  ["disputes", "reason"],
  ["disputes", "resolution_note"],
  ["audit_events", "detail"],
  ["deliverables", "summary"],
  ["deliverables", "buyer_feedback"],
  ["change_orders", "title"],
  ["change_orders", "description"],
  ["projects", "title"],
  ["projects", "outcome_statement"],
  ["clarification_requests", "question"],
  ["clarification_requests", "answer"],
  ["developer_block_requests", "detail"],
  ["developer_block_requests", "admin_note"],
  ["messages", "body"],
  ["message_threads", "subject"],
  ["notifications", "title"],
  ["notifications", "body"],
  ["contract_versions", "snapshot"],
  ["contract_versions", "reason"],
  ["payment_provider_events", "detail"],
  ["ops_events", "detail"],
  ["ops_events", "summary"],
  ["bids", "message"],
  ["build_exams", "developer_reply"],
  ["build_exams", "reviewer_notes"],
  ["build_exams", "admin_question"],
];

export function isFixtureAccount(profile) {
  const email = String(profile?.email || "").trim().toLowerCase();
  if (!email || email === "dummy") return true;
  const at = email.lastIndexOf("@");
  const local = at === -1 ? email : email.slice(0, at);
  const domain = at === -1 ? "" : email.slice(at + 1);
  if (local === "dummy") return true;
  if (domain.endsWith(".test")) return true;
  if (domain === "example.com" || domain === "example.org" || domain === "example.net") return true;
  return false;
}

function likePattern(token) {
  return `%${String(token).replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

async function hasRow(db, sql, binds) {
  const row = await db.prepare(sql).bind(...binds).first();
  return Boolean(row);
}

async function mustRetain(db, id) {
  const checks = [
    ["SELECT 1 AS hit FROM contracts WHERE buyer_id = ? OR developer_id = ? LIMIT 1", [id, id]],
    ["SELECT 1 AS hit FROM bids WHERE developer_id = ? LIMIT 1", [id]],
    [
      `SELECT 1 AS hit FROM bids
         JOIN projects ON projects.id = bids.project_id
        WHERE projects.buyer_id = ? AND bids.developer_id != ?
        LIMIT 1`,
      [id, id],
    ],
    [
      `SELECT 1 AS hit FROM payments
        WHERE profile_id = ? AND (status IN ('paid', 'refunded') OR consumed_at IS NOT NULL)
        LIMIT 1`,
      [id],
    ],
    ["SELECT 1 AS hit FROM reviews WHERE author_id = ? OR subject_id = ? LIMIT 1", [id, id]],
    ["SELECT 1 AS hit FROM disputes WHERE raised_by = ? OR resolved_by = ? LIMIT 1", [id, id]],
    ["SELECT 1 AS hit FROM audit_events WHERE actor_id = ? LIMIT 1", [id]],
    ["SELECT 1 AS hit FROM message_threads WHERE buyer_id = ? OR developer_id = ? LIMIT 1", [id, id]],
    ["SELECT 1 AS hit FROM clarification_requests WHERE developer_id = ? LIMIT 1", [id]],
    [
      `SELECT 1 AS hit FROM clarification_requests
         JOIN projects ON projects.id = clarification_requests.project_id
        WHERE projects.buyer_id = ? AND clarification_requests.developer_id != ?
        LIMIT 1`,
      [id, id],
    ],
    ["SELECT 1 AS hit FROM developer_block_requests WHERE buyer_id = ? OR developer_id = ? LIMIT 1", [id, id]],
    [
      `SELECT 1 AS hit FROM project_invites
        WHERE accepted_at IS NOT NULL AND (created_by = ? OR accepted_by = ?)
        LIMIT 1`,
      [id, id],
    ],
  ];
  for (const [sql, binds] of checks) {
    if (await hasRow(db, sql, binds)) return true;
  }
  return false;
}

async function scrubToken(db, token) {
  const needle = String(token || "");
  if (needle.length < 3) return;
  const pattern = likePattern(needle);
  for (const [table, column] of TEXT_FIELDS) {
    if (!/^[a-z_]+$/.test(table) || !/^[a-z_]+$/.test(column)) {
      throw new Error("Unexpected column");
    }
    await db
      .prepare(
        `UPDATE ${table} SET ${column} = REPLACE(${column}, ?, '[deleted]') WHERE ${column} LIKE ? ESCAPE '\\'`,
      )
      .bind(needle, pattern)
      .run();
  }
}

async function listIds(db, sql, binds) {
  const result = await db.prepare(sql).bind(...binds).all();
  return result.results || [];
}

async function purgePrivateFiles(db, env, userId) {
  const owned = await listIds(db, "SELECT id FROM files WHERE owner_id = ?", [userId]);
  for (const row of owned) {
    await deleteFile(db, row.id, { env, reason: "account_deletion", actorId: userId });
  }
  const identities = await listIds(
    db,
    "SELECT document_storage_path, selfie_storage_path FROM identity_verifications WHERE developer_id = ?",
    [userId],
  );
  for (const row of identities) {
    await deleteFile(db, row.document_storage_path, { env, reason: "account_deletion", actorId: userId });
    await deleteFile(db, row.selfie_storage_path, { env, reason: "account_deletion", actorId: userId });
  }
  const proofs = await listIds(
    db,
    "SELECT proof_storage_path FROM payments WHERE profile_id = ? AND proof_storage_path IS NOT NULL",
    [userId],
  );
  for (const row of proofs) {
    await deleteFile(db, row.proof_storage_path, { env, reason: "account_deletion", actorId: userId });
  }
}

async function purgePersonal(db, env, profile) {
  const id = profile.id;
  const email = profile.email;
  const now = nowIso();
  await purgePrivateFiles(db, env, id);
  await scrubToken(db, email);
  const name = String(profile.full_name || "").trim();
  if (name.length >= 8 && name !== "Deleted account") await scrubToken(db, name);
  await db.prepare("UPDATE messages SET body = '[deleted]' WHERE sender_id = ?").bind(id).run();
  await db.prepare("DELETE FROM notifications WHERE profile_id = ?").bind(id).run();
  await db.prepare("DELETE FROM email_codes WHERE email = ?").bind(email).run();
  await db.prepare("DELETE FROM project_invites WHERE email = ? OR created_by = ? OR accepted_by = ?").bind(email, id, id).run();
  await db.prepare("DELETE FROM interview_assessments WHERE developer_id = ?").bind(id).run();
  await db
    .prepare(
      `UPDATE build_exams
          SET github_url = NULL, live_url = NULL, normalized_repo_url = NULL, developer_reply = NULL
        WHERE developer_id = ?`,
    )
    .bind(id)
    .run();
  await db
    .prepare(
      `UPDATE payments
          SET proof_storage_path = CASE WHEN proof_storage_path IS NULL THEN NULL ELSE '[purged]' END,
              payer_reference = NULL,
              updated_at = ?
        WHERE profile_id = ?`,
    )
    .bind(now, id)
    .run();
  await db
    .prepare(
      `UPDATE identity_verifications
          SET document_type = 'removed',
              document_country = 'removed',
              rejection_reason = NULL,
              document_storage_path = CASE WHEN document_storage_path IS NULL THEN NULL ELSE '[purged]' END,
              selfie_storage_path = CASE WHEN selfie_storage_path IS NULL THEN NULL ELSE '[purged]' END
        WHERE developer_id = ?`,
    )
    .bind(id)
    .run();
  await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
}

async function anonymizeProfile(db, profile) {
  const now = nowIso();
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await hashPassword(bytesToHex(crypto.getRandomValues(new Uint8Array(32))), salt);
  const email = `deleted.${profile.id}@deleted.okavo.invalid`;
  await db
    .prepare(
      `UPDATE profiles
          SET email = ?, password_hash = ?, password_salt = ?, full_name = 'Deleted account',
              country_code = NULL, timezone = NULL, updated_at = ?
        WHERE id = ?`,
    )
    .bind(email, hash, salt, now, profile.id)
    .run();
  await db
    .prepare(
      `UPDATE buyer_profiles
          SET organization_name = 'Deleted account', website = NULL, updated_at = ?
        WHERE profile_id = ?`,
    )
    .bind(now, profile.id)
    .run();
  await db
    .prepare(
      `UPDATE developer_profiles
          SET headline = '', bio = NULL, hourly_rate_usd = NULL, bidding_unlocked_at = NULL,
              blocked_at = COALESCE(blocked_at, ?), updated_at = ?
        WHERE profile_id = ?`,
    )
    .bind(now, now, profile.id)
    .run();
}

async function hardDelete(db, profile) {
  const id = profile.id;
  await db.prepare("DELETE FROM identity_verifications WHERE developer_id = ?").bind(id).run();
  await db.prepare("DELETE FROM build_exams WHERE developer_id = ?").bind(id).run();
  await db
    .prepare(
      `DELETE FROM clarification_requests
        WHERE developer_id = ? OR project_id IN (SELECT id FROM projects WHERE buyer_id = ?)`,
    )
    .bind(id, id)
    .run();
  await db
    .prepare(
      `DELETE FROM payments
        WHERE profile_id = ? AND status NOT IN ('paid', 'refunded') AND consumed_at IS NULL`,
    )
    .bind(id)
    .run();
  await db.prepare("DELETE FROM profiles WHERE id = ?").bind(id).run();
}

async function recordAccountDeletion(db, profileId, mode) {
  await db
    .prepare(
      `INSERT INTO audit_events (id, actor_id, entity_type, entity_id, action, detail, created_at)
       VALUES (?, ?, 'profile', ?, 'account.delete', ?, ?)`,
    )
    .bind(crypto.randomUUID(), profileId, profileId, JSON.stringify({ mode }), nowIso())
    .run();
}

export async function deleteAccount(db, env, user, body) {
  if (!user?.id) throw new HttpError(401, "Log in again.");
  const profile = await db.prepare("SELECT * FROM profiles WHERE id = ?").bind(user.id).first();
  if (!profile) throw new HttpError(401, "Log in again.");
  if (String(body?.confirmation ?? "").trim() !== ACCOUNT_DELETION_PHRASE) {
    throw new HttpError(400, "Type DELETE MY OKAVO ACCOUNT to confirm.");
  }
  const allowed = await consumeRateLimit(db, await sha256(`account-delete:${profile.id}`), 5, 3600);
  if (!allowed) throw new HttpError(429, "Too many attempts. Please try again shortly.");
  const password = String(body?.password ?? "");
  if (!profile.password_hash || !profile.password_salt) throw new HttpError(401, "Password does not match.");
  const actual = await hashPassword(password, profile.password_salt);
  if (actual !== profile.password_hash) throw new HttpError(401, "Password does not match.");
  if (isFixtureAccount(profile)) throw new HttpError(403, "Demo and fixture accounts cannot be deleted.");

  const retain = await mustRetain(db, profile.id);
  await purgePersonal(db, env, profile);
  const mode = retain ? "anonymized" : "deleted";
  if (retain) await anonymizeProfile(db, profile);
  else await hardDelete(db, profile);
  await recordAccountDeletion(db, profile.id, mode);
  return { ok: true, mode };
}
