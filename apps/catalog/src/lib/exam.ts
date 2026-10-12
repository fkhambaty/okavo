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

function unavailable(message: string): never {
  throw new Error(message);
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
  unavailable(
    "Build exams are paused on this backend. No exam was started and nothing was charged."
  );
}

export async function submitBuildExam(
  _examId: string,
  _githubUrl: string,
  _liveUrl: string
) {
  unavailable("Build exam submission is not available on this backend.");
}

export async function replyBuildExam(_examId: string, _reply: string) {
  unavailable("Build exam replies are not available on this backend.");
}

export async function fetchMyBuildExam(): Promise<BuildExam | null> {
  if (!isBackendConfigured) return null;
  const { exam } = await backend<{ exam: null }>("/v1/exams/mine");
  return exam;
}

export async function listOpenBuildExams(): Promise<BuildExam[]> {
  if (!isBackendConfigured) return [];
  const { exams } = await backend<{ exams: BuildExam[] }>("/v1/exams/open");
  return exams ?? [];
}

export async function adminAskExam(_examId: string, _question: string) {
  unavailable("Build exam questions are not available on this backend.");
}

export async function adminDecideExam(
  _examId: string,
  _approve: boolean,
  _notes?: string
) {
  unavailable("Build exam decisions are not available on this backend.");
}

export async function adminSetExamPauses(
  _startsPaused: boolean,
  _autoApprovePaused: boolean
) {
  unavailable("Build exam controls are paused on this backend.");
}

export async function adminSetExamHold(
  _examId: string,
  _hold: boolean,
  _reason?: string
) {
  unavailable("Build exam holds are not available on this backend.");
}

export async function requestExamAnalysis(_examId: string, _accessToken: string) {
  return null;
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
