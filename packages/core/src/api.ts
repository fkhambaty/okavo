/** Worker paths and row shapes the native app reads. Amounts stay in minor units. */

export const DEFAULT_API_URL = "https://okavo-api.fkhambaty.workers.dev";

export type Profile = {
  id: string;
  email: string;
  role: string;
  full_name: string | null;
  email_verified_at: string | null;
  terms_version: string | null;
  terms_accepted_at: string | null;
  organization_name: string | null;
  scale: string | null;
  identity_status: string | null;
  interview_status: string | null;
  bidding_unlocked_at: string | null;
  tier: string | null;
};

export type WorkerProject = {
  id: string;
  title: string;
  stage: string;
  outcome?: string | null;
  category?: string | null;
  budget_min_cents?: number | null;
  budget_max_cents?: number | null;
  monthly_run_cents?: number | null;
  timeline_weeks?: number | null;
  buyer_id?: string;
  buyer_profiles?: { organization_name?: string | null; scale?: string | null } | null;
  scope_items?: Array<{ id: string; label: string; detail?: string | null; included?: boolean }>;
  bids?: Array<{
    id: string;
    developer_id: string;
    amount_cents: number;
    monthly_run_cents?: number | null;
    delivery_weeks: number;
    status: string;
    message?: string | null;
    developer_profiles?: { tier?: string | null; profiles?: { full_name?: string | null; country_code?: string | null } | null } | null;
  }>;
  contracts?: {
    id?: string;
    status?: string;
    lock_reference?: string | null;
    developer_signed_at?: string | null;
    milestones?: Array<{
      id: string;
      title: string;
      description?: string | null;
      amount_cents?: number | null;
      status: string;
      due_on?: string | null;
    }>;
  } | null;
  _bidStats?: { bid_count: number; lowest_bid_cents: number | null };
};

export type DeveloperRow = {
  profile_id: string;
  full_name: string | null;
  country_code: string | null;
  headline: string | null;
  hourly_rate_usd: number | null;
  tier: string | null;
  identity_status: string | null;
  review_count: number | null;
  rating: number | null;
  contracts_delivered: number | null;
};

export type ThreadRow = {
  id: string;
  project_id: string;
  subject: string | null;
  buyer_name?: string | null;
  developer_name?: string | null;
  messages?: Array<{ id: string; sender_id: string; body: string; created_at: string }>;
};

export type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  link?: string | null;
  read_at?: string | null;
  created_at: string;
};

export function centsToLabel(cents: number | null | undefined, currency = "USD"): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "Not recorded";
  return `${currency} ${(cents / 100).toFixed(2)}`;
}
