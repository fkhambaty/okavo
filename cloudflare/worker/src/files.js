import { HttpError } from "./http.js";
import {
  FILE_CHUNK_CHARS,
  FILE_MAX_BYTES,
  base64ByteLength,
  chunkText,
  decodeBase64,
  normalizeUploadMime,
  nowIso,
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

export async function storePrivateFile(db, { ownerId, purpose, mime, data }) {
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
  await db
    .prepare(
      `INSERT INTO files (id, owner_id, purpose, mime_type, byte_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, ownerId, purpose, declared, bytes, now)
    .run();
  try {
    let seq = 0;
    for (const chunk of chunkText(clean, FILE_CHUNK_CHARS)) {
      await db.prepare("INSERT INTO file_chunks (file_id, seq, data) VALUES (?, ?, ?)").bind(id, seq, chunk).run();
      seq += 1;
    }
  } catch (error) {
    await deleteFile(db, id);
    throw error;
  }
  return { id, mime: declared, bytes };
}

export async function deleteFile(db, id) {
  if (!id || id === "[purged]") return;
  await db.prepare("DELETE FROM file_chunks WHERE file_id = ?").bind(id).run();
  await db.prepare("UPDATE files SET deleted_at = COALESCE(deleted_at, ?) WHERE id = ?").bind(nowIso(), id).run();
}

export async function setFileExpiry(db, id, expiresAt) {
  if (!id || id === "[purged]") return;
  await db.prepare("UPDATE files SET expires_at = ? WHERE id = ? AND deleted_at IS NULL").bind(expiresAt, id).run();
}

export async function purgeExpiredIdentityFiles(db) {
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
    await deleteFile(db, row.document_storage_path);
    await deleteFile(db, row.selfie_storage_path);
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
  for (const row of expiredFiles.results || []) await deleteFile(db, row.id);
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

export async function readPrivateFile(db, user, id) {
  if (!user?.email_verified_at) throw new HttpError(401, "Sign in again.");
  if (!id || id === "[purged]") throw new HttpError(404, "This file has been deleted.");
  await purgeExpiredIdentityFiles(db);
  const file = await db.prepare("SELECT * FROM files WHERE id = ?").bind(id).first();
  if (!file || file.deleted_at) throw new HttpError(404, "This file has been deleted.");
  if (file.expires_at && file.expires_at <= nowIso()) {
    await deleteFile(db, id);
    throw new HttpError(410, "This identity file was deleted after the retention window.");
  }
  if (!(await canRead(db, user, file))) throw new HttpError(403, "You cannot open this file.");
  const chunks = await db.prepare("SELECT data FROM file_chunks WHERE file_id = ? ORDER BY seq").bind(id).all();
  const joined = (chunks.results || []).map((row) => row.data).join("");
  if (!joined) throw new HttpError(404, "This file has been deleted.");
  return { bytes: decodeBase64(joined), mime: file.mime_type };
}
