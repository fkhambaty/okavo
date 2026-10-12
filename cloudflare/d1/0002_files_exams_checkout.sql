-- Private files (D1 chunks; R2 is not enabled on this account), build exams,
-- and Razorpay Payment Link columns for hosted checkout.

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('identity_document', 'identity_selfie', 'payment_proof')),
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_files_owner ON files(owner_id, purpose);

CREATE TABLE IF NOT EXISTS file_chunks (
  file_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (file_id, seq)
);

CREATE TABLE IF NOT EXISTS exam_briefs (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  acceptance TEXT NOT NULL,
  stack_hint TEXT NOT NULL DEFAULT 'Any web stack',
  active INTEGER NOT NULL DEFAULT 1,
  assignment_count INTEGER NOT NULL DEFAULT 0,
  last_assigned_at TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO exam_briefs (id, slug, title, summary, acceptance, stack_hint, created_at)
VALUES
  ('brief-mini-booking', 'mini-booking', 'Mini booking page',
   'Build a single-page booking flow: list 3 services, pick a slot, submit a name + email, show a confirmation screen. Seed data is fine; no real payments.',
   'Live URL shows services and slots; submitting creates a confirmation the user can see without refreshing. Repo has a README with run steps.',
   'Next.js / Vite + any backend or localStorage', '2026-10-13T00:00:00.000Z'),
  ('brief-mini-store', 'mini-store', 'Mini catalog checkout',
   'Build a tiny store: 4 products, add to cart, checkout form (name + address), order summary page. No real payment gateway.',
   'Cart persists for the session; checkout shows line items and total; GitHub README explains how to run locally.',
   'Any web stack', '2026-10-13T00:00:00.000Z'),
  ('brief-issue-tracker', 'issue-tracker', 'Personal issue board',
   'Build a Kanban-style board with three columns (Todo / Doing / Done). Create, move, and delete cards. Persist to a DB or local file.',
   'Cards move between columns and survive a refresh; live URL works without a VPN; repo is public or shared with Okavo.',
   'Any web stack', '2026-10-13T00:00:00.000Z'),
  ('brief-auth-notes', 'auth-notes', 'Signed-in notes',
   'Simple notes app: sign up / sign in (magic link or password), create and list notes belonging only to that user.',
   'A second browser/session cannot see the first user’s notes; live demo accounts or seed users documented in README.',
   'Any web stack with auth', '2026-10-13T00:00:00.000Z'),
  ('brief-expense-splitter', 'expense-splitter', 'Shared expense splitter',
   'Build a small trip-expense app. Add people and expenses, choose who paid, and show the simplest balances needed to settle up.',
   'Users can add and remove people and expenses; totals remain after refresh; balances add up correctly; README includes run steps.',
   'Any web stack', '2026-10-13T00:00:00.000Z'),
  ('brief-support-inbox', 'support-inbox', 'Mini support inbox',
   'Build an inbox with seeded support tickets. Filter by open/closed, open a ticket, add a reply, and close or reopen it.',
   'Filters and status changes work; replies remain after refresh; a direct link can reopen a ticket; README includes run steps.',
   'Any web stack', '2026-10-13T00:00:00.000Z'),
  ('brief-inventory-alerts', 'inventory-alerts', 'Low-stock inventory',
   'Build an inventory list where a user can add products, record stock changes, and filter products below a configurable threshold.',
   'Stock cannot become negative; low-stock filtering works; data survives refresh; README explains setup and trade-offs.',
   'Any web stack', '2026-10-13T00:00:00.000Z'),
  ('brief-event-rsvp', 'event-rsvp', 'Event RSVP page',
   'Build an event page with capacity, guest RSVP form, attendee list, and cancellation using a generated confirmation code.',
   'Capacity is enforced; duplicate email RSVPs are handled; cancellation frees a place; README includes run steps.',
   'Any web stack', '2026-10-13T00:00:00.000Z'),
  ('brief-reading-list', 'reading-list', 'Personal reading list',
   'Build a reading tracker. Add a book, move it between To read / Reading / Finished, rate finished books, and search by title.',
   'State changes and search work; ratings are limited to finished books; data survives refresh; README includes run steps.',
   'Any web stack', '2026-10-13T00:00:00.000Z'),
  ('brief-poll-builder', 'poll-builder', 'One-question polls',
   'Build a poll creator with two to six choices, a shareable voting page, one vote per browser, and a results view.',
   'Invalid polls are blocked; voting updates results; repeat voting is prevented in the same browser; README states limitations.',
   'Any web stack', '2026-10-13T00:00:00.000Z'),
  ('brief-habit-streak', 'habit-streak', 'Habit streak tracker',
   'Build a weekly habit tracker. Create habits, mark days complete, and show current and best streaks.',
   'A day cannot be counted twice; streak calculations are correct across missed days; state survives refresh; README includes run steps.',
   'Any web stack', '2026-10-13T00:00:00.000Z'),
  ('brief-link-shortener', 'link-shortener', 'Mini link manager',
   'Build a link manager that creates short aliases, redirects aliases, counts visits, and lets the owner disable a link.',
   'Aliases are unique; disabled links do not redirect; visit counts update; unsafe non-http destinations are rejected; README includes run steps.',
   'Any web stack', '2026-10-13T00:00:00.000Z')
ON CONFLICT(slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS build_exams (
  id TEXT PRIMARY KEY,
  developer_id TEXT NOT NULL,
  brief_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  started_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  submitted_at TEXT,
  github_url TEXT,
  live_url TEXT,
  auto_score_overall INTEGER,
  auto_score_detail TEXT NOT NULL DEFAULT '{}',
  auto_analyzed_at TEXT,
  admin_question TEXT,
  developer_reply TEXT,
  reviewer_notes TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_deadline_at TEXT,
  auto_approved_at TEXT,
  auto_approval_hold INTEGER NOT NULL DEFAULT 0,
  auto_approval_hold_reason TEXT,
  normalized_repo_url TEXT,
  duplicate_repo INTEGER NOT NULL DEFAULT 0,
  duplicate_of_exam_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_build_exams_dev ON build_exams(developer_id, started_at);
CREATE INDEX IF NOT EXISTS idx_build_exams_status ON build_exams(status, review_deadline_at);

UPDATE exam_controls
   SET starts_paused = 0, auto_approve_paused = 0, updated_at = '2026-10-13T00:00:00.000Z'
 WHERE singleton = 1;

ALTER TABLE payments ADD COLUMN provider_link_id TEXT;
ALTER TABLE payments ADD COLUMN provider_link_url TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_link ON payments(provider_link_id);
