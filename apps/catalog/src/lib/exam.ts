/**
 * Build-exam helpers — timed challenge after identity approval.
 */

import { backend, isBackendConfigured } from "./backend";

export const EXAM_WINDOW_HOURS = 5;
export const EXAM_ADMIN_SLA_HOURS = 48;
export const EXAM_AUTO_APPROVE_MIN_SCORE = 70;
export const EXAM_DAILY_START_CAP = 10;

export type BuildExamStatus =
  | "in_progress"
  | "submitted"
  | "admin_questions"
  | "approved"
  | "rejected"
  | "expired";

export type ExamControls = {
  startsPaused: boolean;
  autoApprovePaused: boolean;
  updatedAt: string;
};

export type ExamBrief = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  acceptance: string;
  stackHint: string;
};

export type BuildExam = {
  id: string;
  status: BuildExamStatus;
  briefId: string;
  startedAt: string;
  dueAt: string;
  submittedAt: string | null;
  githubUrl: string | null;
  liveUrl: string | null;
  autoScoreOverall: number | null;
  autoScoreDetail: Record<string, unknown>;
  adminQuestion: string | null;
  developerReply: string | null;
  reviewerNotes: string | null;
  reviewDeadlineAt: string | null;
  autoApprovedAt: string | null;
  autoApprovalHold: boolean;
  autoApprovalHoldReason: string | null;
  normalizedRepoUrl: string | null;
  duplicateRepo: boolean;
  duplicateOfExamId: string | null;
  brief?: ExamBrief | null;
};

function mapExam(row: Record<string, unknown> | null): BuildExam | null {
  if (!row) return null;
  const brief = row.brief as Record<string, unknown> | null;
  return {
    id: String(row.id),
    status: row.status as BuildExamStatus,
    briefId: String(row.brief_id),
    startedAt: String(row.started_at),
    dueAt: String(row.due_at),
    submittedAt: (row.submitted_at as string | null) ?? null,
    githubUrl: (row.github_url as string | null) ?? null,
    liveUrl: (row.live_url as string | null) ?? null,
    autoScoreOverall:
      row.auto_score_overall === null || row.auto_score_overall === undefined
        ? null
        : Number(row.auto_score_overall),
    autoScoreDetail: (row.auto_score_detail as Record<string, unknown>) ?? {},
    adminQuestion: (row.admin_question as string | null) ?? null,
    developerReply: (row.developer_reply as string | null) ?? null,
    reviewerNotes: (row.reviewer_notes as string | null) ?? null,
    reviewDeadlineAt: (row.review_deadline_at as string | null) ?? null,
    autoApprovedAt: (row.auto_approved_at as string | null) ?? null,
    autoApprovalHold: Boolean(row.auto_approval_hold),
    autoApprovalHoldReason: (row.auto_approval_hold_reason as string | null) ?? null,
    normalizedRepoUrl: (row.normalized_repo_url as string | null) ?? null,
    duplicateRepo: Boolean(row.duplicate_repo),
    duplicateOfExamId: (row.duplicate_of_exam_id as string | null) ?? null,
    brief: brief
      ? {
          id: String(brief.id),
          slug: String(brief.slug),
          title: String(brief.title),
          summary: String(brief.summary),
          acceptance: String(brief.acceptance),
          stackHint: String(brief.stack_hint),
        }
      : null,
  };
}

export async function processExamAutoApprovals() {
  if (!isBackendConfigured) return;
}

export async function fetchExamControls(): Promise<ExamControls> {
  const { controls } = await backend<{
    controls: { starts_paused: boolean; auto_approve_paused: boolean; updated_at: string };
  }>("/v1/exams/controls");
  return {
    startsPaused: Boolean(controls.starts_paused),
    autoApprovePaused: Boolean(controls.auto_approve_paused),
    updatedAt: controls.updated_at,
  };
}

export async function startBuildExam() {
  await backend("/v1/exams/start", { body: {} });
}

export async function submitBuildExam(
  examId: string,
  githubUrl: string,
  liveUrl: string
) {
  await backend(`/v1/exams/${examId}/submit`, {
    body: { github_url: githubUrl, live_url: liveUrl },
  });
}

export async function replyBuildExam(examId: string, reply: string) {
  await backend(`/v1/exams/${examId}/reply`, { body: { reply } });
}

export async function fetchMyBuildExam(): Promise<BuildExam | null> {
  if (!isBackendConfigured) return null;
  const { exam } = await backend<{ exam: Record<string, unknown> | null }>(
    "/v1/exams/mine"
  );
  return mapExam(exam);
}

export async function listOpenBuildExams(): Promise<BuildExam[]> {
  if (!isBackendConfigured) return [];
  const { exams } = await backend<{ exams: Record<string, unknown>[] }>(
    "/v1/exams/open"
  );
  return (exams ?? []).map((row) => mapExam(row)).filter((row): row is BuildExam => Boolean(row));
}

export async function adminAskExam(examId: string, question: string) {
  await backend(`/v1/exams/${examId}/ask`, { body: { question } });
}

export async function adminDecideExam(
  examId: string,
  approve: boolean,
  notes?: string
) {
  await backend(`/v1/exams/${examId}/decide`, { body: { approve, notes } });
}

export async function adminSetExamPauses(
  startsPaused: boolean,
  autoApprovePaused: boolean
) {
  await backend("/v1/exams/controls", {
    body: { starts_paused: startsPaused, auto_approve_paused: autoApprovePaused },
  });
}

export async function adminSetExamHold(
  examId: string,
  hold: boolean,
  reason?: string
) {
  await backend(`/v1/exams/${examId}/hold`, { body: { hold, reason } });
}

export async function requestExamAnalysis(examId: string, _accessToken: string) {
  return backend(`/v1/exams/${examId}/score`, { body: {} });
}

/** Display INR paise for 10% hire fee from bid USD cents ($1 → ₹99). */
export function hireFeeInrPaiseFromBidUsdCents(bidUsdCents: number): number {
  const feeUsd = bidUsdCents / 100 / 10;
  return Math.max(9900, Math.round(feeUsd * 9900));
}

export function hireFeeUsdLabel(bidUsdCents: number): string {
  const fee = Math.max(1, Math.round(bidUsdCents / 100 / 10));
  return `$${fee}`;
}
