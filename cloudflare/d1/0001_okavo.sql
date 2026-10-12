-- Okavo production database on the existing Cloudflare D1 database `okavo`.
-- Authorization lives in the Worker. These tables do not grant browser access.

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'buyer' CHECK (role IN ('buyer', 'developer', 'admin')),
  full_name TEXT NOT NULL,
  country_code TEXT,
  timezone TEXT,
  email_verified_at TEXT,
  terms_version TEXT,
  terms_accepted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS buyer_profiles (
  profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  organization_name TEXT NOT NULL,
  scale TEXT NOT NULL DEFAULT 'local_business',
  website TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS developer_profiles (
  profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  headline TEXT NOT NULL DEFAULT '',
  bio TEXT,
  hourly_rate_usd REAL,
  tier TEXT NOT NULL DEFAULT 'applicant',
  identity_status TEXT NOT NULL DEFAULT 'not_started',
  interview_status TEXT NOT NULL DEFAULT 'not_started',
  bidding_unlocked_at TEXT,
  blocked_at TEXT,
  contracts_delivered INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('access', 'refresh')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS email_codes (
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (email, purpose)
);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  hits INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL REFERENCES buyer_profiles(profile_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  outcome_statement TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'drafting',
  budget_min_cents INTEGER NOT NULL,
  budget_max_cents INTEGER NOT NULL,
  monthly_run_cents INTEGER NOT NULL DEFAULT 0,
  timeline_weeks INTEGER NOT NULL DEFAULT 6,
  visibility TEXT NOT NULL DEFAULT 'public',
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_stage ON projects(stage, created_at);

CREATE TABLE IF NOT EXISTS scope_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  included INTEGER NOT NULL DEFAULT 1,
  acceptance_criteria TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scope_project ON scope_items(project_id, position);

CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  buyer_id TEXT NOT NULL,
  developer_id TEXT,
  lock_reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',
  current_version INTEGER NOT NULL DEFAULT 1,
  agreed_amount_cents INTEGER,
  agreed_monthly_cents INTEGER,
  agreed_weeks INTEGER,
  warranty_days INTEGER NOT NULL DEFAULT 30,
  locked_at TEXT,
  buyer_signed_at TEXT,
  developer_signed_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contract_versions (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (contract_id, version)
);

CREATE TABLE IF NOT EXISTS bids (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  developer_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  amount_cents INTEGER NOT NULL,
  monthly_run_cents INTEGER NOT NULL DEFAULT 0,
  delivery_weeks INTEGER NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  accepts_locked_scope INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, developer_id)
);
CREATE INDEX IF NOT EXISTS idx_bids_project ON bids(project_id, status);

CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  due_on TEXT,
  funded_at TEXT,
  submitted_at TEXT,
  accepted_at TEXT,
  released_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deliverables (
  id TEXT PRIMARY KEY,
  milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  developer_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  preview_url TEXT,
  repository_url TEXT,
  submitted_at TEXT NOT NULL,
  buyer_feedback TEXT
);

CREATE TABLE IF NOT EXISTS change_orders (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  raised_by TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed',
  amount_cents INTEGER,
  added_weeks INTEGER DEFAULT 0,
  decided_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS message_threads (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  buyer_id TEXT NOT NULL,
  developer_id TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  last_message_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link_path TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_profile ON notifications(profile_id, created_at);

CREATE TABLE IF NOT EXISTS disputes (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL,
  raised_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  reason TEXT NOT NULL,
  scope_item_ids TEXT,
  resolution_note TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  rating REAL NOT NULL,
  score_scope INTEGER NOT NULL,
  score_quality INTEGER NOT NULL,
  score_communication INTEGER NOT NULL,
  score_timeliness INTEGER NOT NULL,
  matched_expectation INTEGER NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE (contract_id, author_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  provider TEXT NOT NULL,
  provider_reference TEXT,
  provider_order_id TEXT,
  provider_payment_id TEXT,
  project_id TEXT,
  contract_id TEXT,
  milestone_id TEXT,
  bid_id TEXT,
  payer_reference TEXT,
  proof_storage_path TEXT,
  failure_code TEXT,
  paid_at TEXT,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_profile ON payments(profile_id, purpose, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_order ON payments(provider, provider_order_id);

CREATE TABLE IF NOT EXISTS payment_provider_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  provider_order_id TEXT,
  provider_payment_id TEXT,
  payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  detail TEXT NOT NULL DEFAULT '{}',
  received_at TEXT NOT NULL,
  processed_at TEXT,
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE IF NOT EXISTS ops_events (
  id TEXT PRIMARY KEY,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  code TEXT NOT NULL,
  summary TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  detail TEXT NOT NULL DEFAULT '{}',
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS identity_verifications (
  id TEXT PRIMARY KEY,
  developer_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  document_type TEXT NOT NULL,
  document_country TEXT NOT NULL,
  document_storage_path TEXT,
  selfie_storage_path TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  rejection_reason TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS interview_assessments (
  id TEXT PRIMARY KEY,
  developer_id TEXT NOT NULL,
  score_security INTEGER,
  score_efficiency INTEGER,
  score_maintainability INTEGER,
  score_recovery INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clarification_requests (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  developer_id TEXT NOT NULL,
  scope_item_id TEXT,
  question TEXT NOT NULL,
  answer TEXT,
  created_at TEXT NOT NULL,
  answered_at TEXT
);

CREATE TABLE IF NOT EXISTS project_invites (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  accepted_by TEXT,
  created_at TEXT NOT NULL,
  accepted_at TEXT
);

CREATE TABLE IF NOT EXISTS developer_block_requests (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL,
  developer_id TEXT NOT NULL,
  project_id TEXT,
  reason TEXT NOT NULL,
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  admin_note TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exam_controls (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  starts_paused INTEGER NOT NULL DEFAULT 1,
  auto_approve_paused INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

INSERT INTO exam_controls (singleton, starts_paused, auto_approve_paused, updated_at)
VALUES (1, 1, 1, '1970-01-01T00:00:00.000Z')
ON CONFLICT(singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS site_visits (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  session_id TEXT,
  is_new_visitor INTEGER NOT NULL DEFAULT 0,
  path TEXT NOT NULL,
  query TEXT,
  referrer_host TEXT,
  referrer_url TEXT,
  channel TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  timezone TEXT,
  device TEXT,
  os TEXT,
  browser TEXT,
  screen_width INTEGER,
  language TEXT,
  profile_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_site_visits_created ON site_visits(created_at);
