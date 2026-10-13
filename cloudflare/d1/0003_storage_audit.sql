-- Private-file storage metadata and deletion audit.
-- R2 is not enabled on this Cloudflare account (API error 10042).
-- New uploads stay in D1 until a FILES binding exists. This migration does not
-- move bytes and does not claim that R2 is live.

ALTER TABLE files ADD COLUMN storage_backend TEXT NOT NULL DEFAULT 'd1';
ALTER TABLE files ADD COLUMN r2_key TEXT;

CREATE TABLE IF NOT EXISTS deletion_audit (
  id TEXT PRIMARY KEY,
  file_id TEXT,
  purpose TEXT,
  actor_id TEXT,
  reason TEXT NOT NULL,
  storage_backend TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deletion_audit_created ON deletion_audit(created_at);
