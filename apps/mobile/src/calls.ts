import {
  assertQuoteIsDisplayOnly,
  centsToLabel,
  type DeveloperRow,
  type NotificationRow,
  type PaymentQuote,
  type ThreadRow,
  type WorkerProject,
} from "@okavo/core";
import { api } from "./runtime";

export { centsToLabel };

export async function listProjects(): Promise<WorkerProject[]> {
  const body = await api.request<{ projects: WorkerProject[] }>("/v1/projects");
  return body.projects ?? [];
}

export async function listDevelopers(): Promise<DeveloperRow[]> {
  const body = await api.request<{ developers: DeveloperRow[] }>("/v1/developers");
  return body.developers ?? [];
}

export async function developerListing(id: string): Promise<DeveloperRow | null> {
  const body = await api.request<{ developer: DeveloperRow | null }>(`/v1/developers/${encodeURIComponent(id)}`);
  return body.developer;
}

export async function developerAccount(): Promise<{
  account: {
    tier: string | null;
    identity_status: string | null;
    interview_status: string | null;
    bidding_unlocked_at: string | null;
  } | null;
}> {
  return api.request("/v1/developer/account");
}

export async function listThreads(): Promise<ThreadRow[]> {
  const body = await api.request<{ threads: ThreadRow[] }>("/v1/threads");
  return body.threads ?? [];
}

export async function sendThreadMessage(threadId: string, body: string): Promise<void> {
  await api.request(`/v1/threads/${encodeURIComponent(threadId)}/messages`, { method: "POST", body: { body } });
}

export async function listNotifications(): Promise<NotificationRow[]> {
  const body = await api.request<{ notifications: NotificationRow[] }>("/v1/notifications");
  return body.notifications ?? [];
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.request(`/v1/notifications/${encodeURIComponent(id)}/read`, { method: "POST", body: {} });
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.request("/v1/notifications/read", { method: "POST", body: {} });
}

export async function unconsumedPosting(): Promise<boolean> {
  const body = await api.request<{ unconsumed: boolean }>("/v1/posting-fees/unconsumed");
  return Boolean(body.unconsumed);
}

export async function publishRequirement(input: {
  title: string;
  category: string;
  outcome: string;
  budgetMinCents: number;
  budgetMaxCents: number;
  timelineWeeks: number;
}): Promise<void> {
  await api.request("/v1/projects", {
    method: "POST",
    body: {
      title: input.title,
      category: input.category,
      outcome: input.outcome,
      budget_min_cents: input.budgetMinCents,
      budget_max_cents: input.budgetMaxCents,
      timeline_weeks: input.timelineWeeks,
    },
  });
}

export async function placeBid(projectId: string, input: { amountCents: number; weeks: number; message: string }): Promise<void> {
  await api.request(`/v1/projects/${encodeURIComponent(projectId)}/bids`, {
    method: "POST",
    body: { amount_cents: input.amountCents, delivery_weeks: input.weeks, message: input.message },
  });
}

export async function paymentQuote(purpose: "requirement_posting" | "bidding_membership"): Promise<PaymentQuote> {
  const quote = await api.request<PaymentQuote>(`/v1/payments/quote?purpose=${purpose}`);
  return assertQuoteIsDisplayOnly(quote);
}

export async function myExam(): Promise<{ exam: Record<string, unknown> | null }> {
  return api.request("/v1/exams/mine");
}

export async function startExam(): Promise<void> {
  await api.request("/v1/exams/start", { method: "POST", body: {} });
}

export async function submitExam(id: string, githubUrl: string, liveUrl: string): Promise<void> {
  await api.request(`/v1/exams/${encodeURIComponent(id)}/submit`, {
    method: "POST",
    body: { github_url: githubUrl, live_url: liveUrl },
  });
}

export async function decideExam(id: string, approve: boolean): Promise<void> {
  await api.request(`/v1/exams/${encodeURIComponent(id)}/decide`, {
    method: "POST",
    body: { approve, notes: approve ? "Approved from the Okavo app" : "Not accepted from the Okavo app" },
  });
}

export async function openExams(): Promise<{ exams: Array<Record<string, unknown>> }> {
  return api.request("/v1/exams/open");
}

export async function verificationQueue(): Promise<{ items: Array<Record<string, unknown>> }> {
  return api.request("/v1/admin/verifications");
}

export async function decideVerification(id: string, approved: boolean, reason?: string): Promise<void> {
  await api.request(`/v1/admin/verifications/${encodeURIComponent(id)}`, {
    method: "POST",
    body: { approved, reason },
  });
}

export async function insights(): Promise<Record<string, unknown>> {
  return api.request("/v1/admin/insights");
}

export async function operationsHealth(): Promise<Record<string, unknown>> {
  return api.request("/v1/admin/operations");
}

export async function auditBuckets(): Promise<{ counts: Record<string, number> }> {
  return api.request("/v1/admin/audit/buckets");
}

export async function auditEvents(): Promise<{ events: Array<Record<string, unknown>> }> {
  return api.request("/v1/admin/audit?bucket=7d");
}

export async function listBlocks(): Promise<{ requests: Array<Record<string, unknown>> }> {
  return api.request("/v1/blocks?status=open");
}

export async function reviewBlock(id: string, approve: boolean, note: string): Promise<void> {
  await api.request(`/v1/blocks/${encodeURIComponent(id)}/review`, {
    method: "POST",
    body: { approve, admin_note: note },
  });
}

export async function submitIdentity(input: {
  documentType: string;
  country: string;
  document: { mime: string; data: string };
  selfie: { mime: string; data: string } | null;
}): Promise<void> {
  await api.request("/v1/identity", {
    method: "POST",
    body: {
      document_type: input.documentType,
      document_country: input.country,
      document: input.document,
      selfie: input.selfie,
    },
  });
}

export async function attestMilestone(milestoneId: string, reference: string, proof: { mime: string; data: string } | null): Promise<void> {
  await api.request(`/v1/milestones/${encodeURIComponent(milestoneId)}/fund`, {
    method: "POST",
    body: { reference, proof },
  });
}

export async function acceptMilestone(milestoneId: string): Promise<void> {
  await api.request(`/v1/milestones/${encodeURIComponent(milestoneId)}/accept`, { method: "POST", body: {} });
}

export async function submitMilestone(milestoneId: string, summary: string): Promise<void> {
  await api.request(`/v1/milestones/${encodeURIComponent(milestoneId)}/submit`, {
    method: "POST",
    body: { summary },
  });
}

export async function countersign(projectId: string): Promise<void> {
  await api.request(`/v1/projects/${encodeURIComponent(projectId)}/countersign`, { method: "POST", body: {} });
}

export async function termsAccepted(version: string): Promise<boolean> {
  const body = await api.request<{ accepted: boolean }>(`/v1/terms?version=${encodeURIComponent(version)}`);
  return Boolean(body.accepted);
}

export async function acceptTerms(version: string): Promise<void> {
  await api.request("/v1/terms", { method: "POST", body: { version } });
}

export async function changePassword(password: string): Promise<void> {
  await api.request("/v1/auth/password", { method: "POST", body: { password } });
}

export async function deleteAccount(password: string, confirmation: string): Promise<"deleted" | "anonymized"> {
  const body = await api.request<{ ok: boolean; mode?: string }>("/v1/auth/account/delete", {
    method: "POST",
    body: { password, confirmation },
  });
  return body.mode === "anonymized" ? "anonymized" : "deleted";
}

export function textField(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}
