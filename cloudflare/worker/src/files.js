import { HttpError } from "./http.js";
import {
  FILE_CHUNK_CHARS,
  FILE_MAX_BYTES,
  base64ByteLength,
  chunkText,
  decodeBase64,
  normalizeUploadMime,
  nowIso,
  r2Enabled,
  sniffMime,
} from "./pure.js";

const PURPOSES = new Set(["identity_document", "identity_selfie", "payment_proof"]);

function cleanBase64(value) {
  const clean = String(value || "").replace(/\s/g, "");
  if (!clean || clean.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) {
    throw new HttpError(400, "The file was not a valid upload.");
  }
  return clean;
}

async function recordDeletion(db, { fileId, purpose, actorId, reason, backend }) {
  await db
    .prepare(
      `INSERT INTO deletion_audit (id, file_id, purpose, actor_id, reason, storage_backend, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), fileId || null, purpose || null, actorId || "system", reason, backend || "d1", nowIso())
    .run();
}

async function insertD1File(db, { id, ownerId, purpose, mime, bytes, now, clean }) {
  await db
    .prepare(
      `INSERT INTO files (id, owner_id, purpose, mime_type, byte_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, ownerId, purpose, mime, bytes, now)
    .run();
  let seq = 0;
  for (const chunk of chunkText(clean, FILE_CHUNK_CHARS)) {
    await db.prepare("INSERT INTO file_chunks (file_id, seq, data) VALUES (?, ?, ?)").bind(id, seq, chunk).run();
    seq += 1;
  }
}

export async function storePrivateFile(db, { ownerId, purpose, mime, data }, env) {
  if (!PURPOSES.has(purpose)) throw new HttpError(400, "Unknown file purpose");
  const clean = cleanBase64(data);
  const bytes = base64ByteLength(clean);
  if (!Number.isFinite(bytes) || bytes <= 0 || bytes > FILE_MAX_BYTES) {
    throw new HttpError(400, "Files must be 5 MB or smaller.");
  }
  const declared = normalizeUploadMime(mime);
  if (!declared) throw new HttpError(400, "Upload a JPEG, PNG, WebP, or PDF.");
  if (purpose === "identity_selfie" && declared === "application/pdf") {
    throw new HttpError(400, "The selfie must be a JPEG, PNG, or WebP photo.");
  }
  const sniffed = sniffMime(decodeBase64(clean.slice(0, 64)));
  if (sniffed !== declared) throw new HttpError(400, "That file does not match the declared type.");

  const id = crypto.randomUUID();
  const now = nowIso();
  if (r2Enabled(env)) {
    const key = `${purpose}/${ownerId}/${id}`;
    const bytesBody = decodeBase64(clean);
    try {
      await env.FILES.put(key, bytesBody, { httpMetadata: { contentType: declared } });
      await db
        .prepare(
          `INSERT INTO files (id, owner_id, purpose, mime_type, byte_size, created_at, storage_backend, r2_key)
           VALUES (?, ?, ?, ?, ?, ?, 'r2', ?)`,
        )
        .bind(id, ownerId, purpose, declared, bytes, now, key)
        .run();
      return { id, mime: declared, bytes, storage: "r2" };
    } catch (error) {
      try {
        await env.FILES.delete(key);
      } catch {
        // The D1 copy below is the fallback. A leftover object is not a public URL.
      }
      if (String(error).includes("no such column")) {
        // Schema is still the D1-only table. Keep the file there.
      } else if (error instanceof HttpError) {
        throw error;
      }
    }
  }
  try {
    await insertD1File(db, { id, ownerId, purpose, mime: declared, bytes, now, clean });
  } catch (error) {
    await deleteFile(db, id, { reason: "upload_failed", actorId: ownerId });
    throw error;
  }
  return { id, mime: declared, bytes, storage: "d1" };
}

export async function deleteFile(db, id, options = {}) {
  if (!id || id === "[purged]") return;
  let file = null;
  try {
    file = await db.prepare("SELECT id, purpose, storage_backend, r2_key, deleted_at FROM files WHERE id = ?").bind(id).first();
  } catch (error) {
    if (!String(error).includes("no such column")) throw error;
    file = await db.prepare("SELECT id, purpose, deleted_at FROM files WHERE id = ?").bind(id).first();
  }
  if (file?.storage_backend === "r2" && file.r2_key && r2Enabled(options.env)) {
    await options.env.FILES.delete(file.r2_key);
  }
  await db.prepare("DELETE FROM file_chunks WHERE file_id = ?").bind(id).run();
  if (!file?.deleted_at) {
    await db.prepare("UPDATE files SET deleted_at = ? WHERE id = ?").bind(nowIso(), id).run();
    try {
      await recordDeletion(db, {
        fileId: id,
        purpose: file?.purpose,
        actorId: options.actorId,
        reason: options.reason || "deleted",
        backend: file?.storage_backend || "d1",
      });
    } catch (error) {
      if (!String(error).includes("no such table")) throw error;
    }
  }
}

export async function setFileExpiry(db, id, expiresAt) {
  if (!id || id === "[purged]") return;
  await db.prepare("UPDATE files SET expires_at = ? WHERE id = ? AND deleted_at IS NULL").bind(expiresAt, id).run();
}

export async function purgeExpiredIdentityFiles(db, env) {
  const now = nowIso();
  const due = await db
    .prepare(
      `SELECT id, document_storage_path, selfie_storage_path
         FROM identity_verifications
        WHERE expires_at IS NOT NULL AND expires_at <= ?
          AND COALESCE(document_storage_path, '') != '[purged]'`,
    )
    .bind(now)
    .all();
  let purged = 0;
  for (const row of due.results || []) {
    await deleteFile(db, row.document_storage_path, { env, reason: "identity_retention", actorId: "system" });
    await deleteFile(db, row.selfie_storage_path, { env, reason: "identity_retention", actorId: "system" });
    await db
      .prepare(
        `UPDATE identity_verifications
            SET document_storage_path = '[purged]',
                selfie_storage_path = CASE WHEN selfie_storage_path IS NULL THEN NULL ELSE '[purged]' END
          WHERE id = ?`,
      )
      .bind(row.id)
      .run();
    purged += 1;
  }
  const expiredFiles = await db
    .prepare(
      `SELECT id FROM files
        WHERE purpose IN ('identity_document', 'identity_selfie')
          AND deleted_at IS NULL AND expires_at IS NOT NULL AND expires_at <= ?`,
    )
    .bind(now)
    .all();
  for (const row of expiredFiles.results || []) {
    await deleteFile(db, row.id, { env, reason: "identity_retention", actorId: "system" });
  }
  return purged;
}

async function canRead(db, user, file) {
  if (!user) return false;
  if (user.role === "admin" || file.owner_id === user.id) return true;
  if (file.purpose !== "payment_proof") return false;
  const row = await db
    .prepare(
      `SELECT contracts.buyer_id, contracts.developer_id
         FROM payments
         JOIN contracts ON contracts.id = payments.contract_id
        WHERE payments.proof_storage_path = ?`,
    )
    .bind(file.id)
    .first();
  return Boolean(row && (row.buyer_id === user.id || row.developer_id === user.id));
}

export async function readPrivateFile(db, user, id, env) {
  if (!user?.email_verified_at) throw new HttpError(401, "Sign in again.");
  if (!id || id === "[purged]") throw new HttpError(404, "This file has been deleted.");
  await purgeExpiredIdentityFiles(db, env);
  const file = await db.prepare("SELECT * FROM files WHERE id = ?").bind(id).first();
  if (!file || file.deleted_at) throw new HttpError(404, "This file has been deleted.");
  if (file.expires_at && file.expires_at <= nowIso()) {
    await deleteFile(db, id, { env, reason: "identity_retention", actorId: user.id });
    throw new HttpError(410, "This identity file was deleted after the retention window.");
  }
  if (!(await canRead(db, user, file))) throw new HttpError(403, "You cannot open this file.");
  if (file.storage_backend === "r2") {
    if (!r2Enabled(env) || !file.r2_key) {
      throw new HttpError(503, "This file was stored for R2, and R2 is not enabled on this account.");
    }
    const object = await env.FILES.get(file.r2_key);
    if (!object) throw new HttpError(404, "This file has been deleted.");
    return { bytes: new Uint8Array(await object.arrayBuffer()), mime: file.mime_type };
  }
  const chunks = await db.prepare("SELECT data FROM file_chunks WHERE file_id = ? ORDER BY seq").bind(id).all();
  const joined = (chunks.results || []).map((row) => row.data).join("");
  if (!joined) throw new HttpError(404, "This file has been deleted.");
  return { bytes: decodeBase64(joined), mime: file.mime_type };
}
