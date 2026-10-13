import { logAudit } from "./audit";
import { apiBase, backend } from "./backend";
import { getAccessToken } from "./sessionClient";
import { checkGuardrails } from "./guardrails";
import type {
  AppNotification,
  Bid,
  BidStatus,
  BuyerScale,
  ChangeOrder,
  ChangeOrderStatus,
  ContractVersion,
  DeveloperAccount,
  DeveloperListing,
  DeveloperTier,
  Dispute,
  Milestone,
  MilestoneStatus,
  NotificationKind,
  Project,
  ProjectStage,
  Review,
  ReviewScores,
  ScopeItem,
  Thread,
} from "../types";

/** PostgREST-shaped rows still arrive nested; the Worker keeps that shape. */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function many<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function toMoney(cents: number | null | undefined) {
  return Math.round((cents ?? 0) / 100);
}

function toCents(amount: number) {
  return Math.round(amount * 100);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeTime(value: string | null | undefined) {
  if (!value) return "recently";
  const diffMs = Date.now() - new Date(value).getTime();
  const hours = Math.round(diffMs / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const SCALE_FROM_DB: Record<string, BuyerScale> = {
  local_business: "Local business",
  smb: "SMB",
  startup: "Startup",
  enterprise: "Enterprise",
};

const TIER_FROM_DB: Record<string, DeveloperTier> = {
  applicant: "Applicant",
  associate: "Associate",
  verified: "Verified",
  principal: "Principal",
};

function milestoneStatus(value: string): MilestoneStatus {
  if (value === "rejected") return "funded";
  if (value === "accepted") return "accepted";
  if (
    value === "pending" ||
    value === "funded" ||
    value === "in_progress" ||
    value === "submitted" ||
    value === "released"
  ) {
    return value;
  }
  return "pending";
}

function projectStage(value: string): ProjectStage {
  if (value === "cancelled") return "closed";
  if (
    value === "drafting" ||
    value === "clarifying" ||
    value === "locked" ||
    value === "hired" ||
    value === "in_delivery" ||
    value === "delivered" ||
    value === "closed"
  ) {
    return value;
  }
  return "drafting";
}


/* eslint-disable @typescript-eslint/no-explicit-any */
function mapProject(row: any, currentUserId: string | null): Project {
  const buyer = one<any>(row.buyer_profiles);
  const contract = one<any>(row.contracts);

  const scope: ScopeItem[] = many<any>(row.scope_items)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((item) => ({
      id: item.id,
      label: item.label,
      detail: item.detail ?? "",
      included: item.included,
      acceptanceCriteria: item.acceptance_criteria ?? undefined,
    }));

  const bids: Bid[] = many<any>(row.bids).map((bid) => {
    const developer = one<any>(bid.developer_profiles);
    const profile = one<any>(developer?.profiles);
    return {
      id: bid.id,
      developerId: bid.developer_id,
      developerName: profile?.full_name ?? "Developer",
      country: profile?.country_code ?? "Remote",
      tier: TIER_FROM_DB[developer?.tier ?? "verified"] ?? "Verified",
      amount: toMoney(bid.amount_cents),
      monthlyOps: toMoney(bid.monthly_run_cents),
      weeks: bid.delivery_weeks,
      note: bid.message ?? "",
      status: bid.status as BidStatus,
      submittedAt: formatDate(bid.created_at),
    };
  });

  const milestones: Milestone[] = many<any>(contract?.milestones)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((milestone) => {
      const deliverable = one<any>(milestone.deliverables);
      return {
        id: milestone.id,
        title: milestone.title,
        description: milestone.description ?? "",
        amount: toMoney(milestone.amount_cents),
        status: milestoneStatus(milestone.status),
        dueOn: milestone.due_on ? formatDate(milestone.due_on) : "",
        deliverable: deliverable
          ? {
              summary: deliverable.summary,
              previewUrl: deliverable.preview_url ?? undefined,
              repositoryUrl: deliverable.repository_url ?? undefined,
              submittedAt: formatDate(deliverable.submitted_at),
              buyerFeedback: deliverable.buyer_feedback ?? undefined,
            }
          : undefined,
      };
    });

  const changeOrders: ChangeOrder[] = many<any>(contract?.change_orders).map(
    (order) => ({
      id: order.id,
      title: order.title,
      description: order.description ?? "",
      status: order.status as ChangeOrderStatus,
      amount: order.amount_cents ? toMoney(order.amount_cents) : undefined,
      addedWeeks: order.added_weeks ?? 0,
      raisedBy: order.raised_by === row.buyer_id ? "buyer" : "developer",
      createdAt: formatDate(order.created_at),
    })
  );

  const versions: ContractVersion[] = many<any>(contract?.contract_versions)
    .map((version) => ({
      version: version.version,
      reason: version.reason,
      createdAt: formatDate(version.created_at),
    }))
    .sort((a, b) => a.version - b.version);

  const disputeRow = one<any>(contract?.disputes);
  const dispute: Dispute | undefined = disputeRow
    ? {
        id: disputeRow.id,
        reason: disputeRow.reason,
        status: disputeRow.status.startsWith("resolved")
          ? "resolved"
          : disputeRow.status === "withdrawn"
            ? "withdrawn"
            : "open",
        raisedBy: disputeRow.raised_by === row.buyer_id ? "buyer" : "developer",
        createdAt: formatDate(disputeRow.created_at),
        resolutionNote: disputeRow.resolution_note ?? undefined,
        scopeItemIds: Array.isArray(disputeRow.scope_item_ids)
          ? disputeRow.scope_item_ids.map(String)
          : undefined,
      }
    : undefined;

  const reviews: Review[] = many<any>(contract?.reviews).map((review) => ({
    id: review.id,
    rating: Number(review.rating),
    scores: {
      scope: review.score_scope,
      quality: review.score_quality,
      communication: review.score_communication,
      timeliness: review.score_timeliness,
    },
    matchedExpectation: review.matched_expectation,
    comment: review.comment ?? "",
    author: review.author_id === row.buyer_id ? "Buyer" : "Developer",
    createdAt: formatDate(review.created_at),
  }));

  const awardedBid = bids.find((bid) => bid.status === "awarded");
  const lockMeta = row._lock as
    | {
        lock_reference?: string;
        locked_at?: string;
        warranty_days?: number;
        developer_signed_at?: string | null;
      }
    | undefined;
  const bidStats = row._bidStats as
    | { bid_count?: number; lowest_bid_cents?: number | null }
    | undefined;

  const lockId =
    contract?.lock_reference ?? lockMeta?.lock_reference ?? undefined;
  const lockedAtRaw = contract?.locked_at ?? lockMeta?.locked_at;
  const developerSignedRaw =
    contract?.developer_signed_at ?? lockMeta?.developer_signed_at;
  const warrantyDays =
    contract?.warranty_days ?? lockMeta?.warranty_days ?? 30;

  const publicBidCount = Math.max(
    bidStats?.bid_count ?? 0,
    bids.length
  );
  const lowestFromStats =
    bidStats?.lowest_bid_cents != null
      ? toMoney(bidStats.lowest_bid_cents)
      : undefined;
  const lowestFromOwn =
    bids.length > 0
      ? Math.min(...bids.map((bid) => bid.amount))
      : undefined;

  return {
    id: row.id,
    title: row.title,
    org: buyer?.organization_name ?? "Buyer",
    scale: SCALE_FROM_DB[buyer?.scale ?? "local_business"] ?? "Local business",
    category: row.category,
    outcome: row.outcome_statement,
    budgetMin: toMoney(row.budget_min_cents),
    budgetMax: toMoney(row.budget_max_cents),
    monthlyOps: toMoney(row.monthly_run_cents),
    timelineWeeks: row.timeline_weeks,
    skills: [row.category],
    scope,
    stage: projectStage(row.stage),
    lockedAt: lockedAtRaw ? formatDate(lockedAtRaw) : undefined,
    lockId,
    developerSignedAt: developerSignedRaw
      ? formatDate(developerSignedRaw)
      : undefined,
    postedAgo: relativeTime(row.published_at ?? row.created_at),
    bids,
    publicBidCount,
    lowestBidAmount: lowestFromStats ?? lowestFromOwn,
    milestones,
    changeOrders,
    versions,
    dispute,
    reviews,
    warrantyDays,
    ownedByMe: currentUserId ? row.buyer_id === currentUserId : false,
    awardedTo: awardedBid?.developerName,
  };
}


const SCALE_TO_DB: Record<string, string> = {
  "Local business": "local_business",
  SMB: "smb",
  Startup: "startup",
  Enterprise: "enterprise",
};

export async function fetchProjects(currentUserId: string | null) {
  const { projects } = await backend<{ projects: unknown[] }>("/v1/projects");
  return (projects ?? []).map((row) => mapProject(row, currentUserId));
}

const nullableNumber = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

function mapListing(row: any): DeveloperListing {
  const reviewCount = row.review_count ?? 0;
  return {
    id: row.profile_id,
    name: row.full_name ?? "Developer",
    headline: row.headline ?? "",
    country: row.country_code ?? "Remote",
    tier: TIER_FROM_DB[row.tier ?? "applicant"] ?? "Applicant",
    hourlyRate: nullableNumber(row.hourly_rate_usd),
    rating: nullableNumber(row.rating),
    reviewCount,
    contractsDelivered: row.contracts_delivered ?? 0,
    lockedScopeRate:
      reviewCount > 0
        ? Math.round((100 * (row.matched_count ?? 0)) / reviewCount)
        : null,
    criteria: {
      scope: nullableNumber(row.rating_scope),
      quality: nullableNumber(row.rating_quality),
      communication: nullableNumber(row.rating_communication),
      timeliness: nullableNumber(row.rating_timeliness),
    },
  };
}

export async function fetchDeveloperDirectory(): Promise<DeveloperListing[]> {
  const { developers } = await backend<{ developers: any[] }>("/v1/developers");
  return (developers ?? []).map(mapListing);
}

export async function fetchDeveloperListing(
  profileId: string
): Promise<DeveloperListing | null> {
  const { developer } = await backend<{ developer: any | null }>(
    `/v1/developers/${profileId}`
  );
  return developer ? mapListing(developer) : null;
}

export type DeveloperReview = Review & {
  projectTitle: string;
  buyerOrg: string;
};

export async function fetchDeveloperReviews(
  profileId: string
): Promise<DeveloperReview[]> {
  const { reviews } = await backend<{ reviews: any[] }>(
    `/v1/developers/${profileId}/reviews`
  );
  return (reviews ?? []).map((row) => ({
    id: row.id,
    rating: Number(row.rating),
    scores: {
      scope: row.score_scope,
      quality: row.score_quality,
      communication: row.score_communication,
      timeliness: row.score_timeliness,
    },
    matchedExpectation: Boolean(row.matched_expectation),
    comment: row.comment ?? "",
    author: row.buyer_org ?? "Buyer",
    createdAt: formatDate(row.created_at),
    projectTitle: row.project_title ?? "Contract",
    buyerOrg: row.buyer_org ?? "Buyer",
  }));
}

export async function fetchDeveloperAccount(
  profileId: string
): Promise<DeveloperAccount> {
  const { account, assessment } = await backend<{
    account: any;
    assessment: any;
  }>(`/v1/developer/account?profile=${profileId}`);
  return {
    identityStatus: (account?.identity_status ?? "not_started") as DeveloperAccount["identityStatus"],
    interviewStatus: (account?.interview_status ?? "not_started") as DeveloperAccount["interviewStatus"],
    membershipPaid: Boolean(account?.bidding_unlocked_at),
    membershipPaidAt: account?.bidding_unlocked_at
      ? formatDate(account.bidding_unlocked_at)
      : undefined,
    tier: TIER_FROM_DB[account?.tier ?? "applicant"] ?? "Applicant",
    interviewScores: [
      { label: "Security practices", score: assessment?.score_security ?? 0 },
      { label: "Efficiency under time pressure", score: assessment?.score_efficiency ?? 0 },
      { label: "Maintainability and structure", score: assessment?.score_maintainability ?? 0 },
      { label: "Recovery from mistakes", score: assessment?.score_recovery ?? 0 },
    ],
  };
}

export async function fetchThreads(userId: string): Promise<Thread[]> {
  const { threads } = await backend<{ threads: any[] }>("/v1/threads");
  return (threads ?? []).map((thread) => {
    const buyerName = one<any>(thread.buyer)?.full_name ?? "Buyer";
    const developerName = one<any>(thread.developer)?.full_name ?? "Developer";
    const viewerIsBuyer = thread.buyer_id === userId;
    return {
      id: thread.id,
      projectId: thread.project_id ?? "",
      subject: thread.subject,
      counterpart: viewerIsBuyer ? developerName : buyerName,
      messages: many<any>(thread.messages).map((message) => ({
        id: message.id,
        from:
          message.sender_id === thread.buyer_id
            ? ("buyer" as const)
            : ("developer" as const),
        authorName:
          message.sender_id === userId
            ? "You"
            : message.sender_id === thread.buyer_id
              ? buyerName
              : developerName,
        body: message.body,
        sentAt: formatDateTime(message.created_at),
      })),
    };
  });
}

export async function openThread(projectId: string, developerId: string) {
  const { id } = await backend<{ id: string }>("/v1/threads", {
    body: { project_id: projectId, developer_id: developerId },
  });
  return id;
}

export async function fetchNotifications(
  _userId: string
): Promise<AppNotification[]> {
  const { notifications } = await backend<{ notifications: any[] }>(
    "/v1/notifications"
  );
  return (notifications ?? []).map((row) => ({
    id: row.id,
    kind: row.kind as NotificationKind,
    title: row.title,
    body: row.body ?? "",
    link: row.link_path ?? undefined,
    read: Boolean(row.read_at),
    createdAt: formatDate(row.created_at),
  }));
}

export async function createProject(
  _buyerId: string,
  input: {
    title: string;
    category: string;
    outcome: string;
    budgetMin: number;
    budgetMax: number;
    monthlyOps: number;
    timelineWeeks: number;
    scale?: string;
    scope: ScopeItem[];
  }
) {
  const guard = checkGuardrails("outcome", input.outcome);
  if (!guard.ok) {
    logAudit("guardrail.block", "project", null, {
      kind: "outcome",
      code: guard.code,
      at: "createProject",
    });
    throw new Error(guard.message);
  }
  const { id } = await backend<{ id: string }>("/v1/projects", {
    body: {
      title: input.title,
      category: input.category,
      outcome: input.outcome,
      budget_min_cents: toCents(input.budgetMin),
      budget_max_cents: toCents(input.budgetMax),
      monthly_run_cents: toCents(input.monthlyOps),
      timeline_weeks: input.timelineWeeks,
      scale: input.scale ? SCALE_TO_DB[input.scale] : undefined,
      scope: input.scope.map((item) => ({
        label: item.label,
        detail: item.detail,
        included: item.included,
        acceptance_criteria: item.acceptanceCriteria ?? "",
      })),
    },
  });
  logAudit("project.publish", "project", id, {
    title: input.title,
    category: input.category,
  });
  return id;
}

export async function lockProject(
  projectId: string,
  _buyerId: string,
  monthlyOps: number,
  weeks: number
) {
  await backend(`/v1/projects/${projectId}/lock`, {
    body: { monthly_ops_cents: toCents(monthlyOps), weeks },
  });
  logAudit("project.lock", "project", projectId);
}

export async function placeBid(
  projectId: string,
  _developerId: string,
  input: { amount: number; monthlyOps: number; weeks: number; note: string }
) {
  await backend(`/v1/projects/${projectId}/bids`, {
    body: {
      amount_cents: toCents(input.amount),
      monthly_run_cents: toCents(input.monthlyOps),
      delivery_weeks: input.weeks,
      message: input.note,
    },
  });
  logAudit("bid.place", "project", projectId, {
    amount: input.amount,
    weeks: input.weeks,
  });
}

export async function setBidStatus(bidId: string, status: BidStatus) {
  await backend(`/v1/bids/${bidId}/status`, { body: { status } });
}

export async function awardBid(projectId: string, bidId: string, _amount: number) {
  await backend(`/v1/bids/${bidId}/award`, { body: { project_id: projectId } });
  logAudit("bid.award", "project", projectId, { bidId });
}

export async function payMembership(_profileId: string, _amountCents: number) {
  throw new Error(
    "Demo membership payment is disabled. Use Razorpay checkout on Verification."
  );
}

export async function payPostingFee(_profileId: string, _amountCents: number) {
  throw new Error(
    "Demo posting payment is disabled. Use Razorpay checkout when publishing."
  );
}

export async function countPostingFees(_profileId: string) {
  const { count } = await backend<{ count: number }>("/v1/posting-fees");
  return count ?? 0;
}

export async function hasUnconsumedPostingFee() {
  const { unconsumed } = await backend<{ unconsumed: boolean }>(
    "/v1/posting-fees/unconsumed"
  );
  return Boolean(unconsumed);
}

export type IdentitySubmission = {
  documentType: string;
  documentCountry: string;
  document: File;
  selfie: File | null;
};

const MAX_PRIVATE_FILE = 5 * 1024 * 1024;

async function filePayload(file: File) {
  if (file.size > MAX_PRIVATE_FILE) {
    throw new Error("Files must be 5 MB or smaller.");
  }
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
  return { mime: file.type || "application/octet-stream", name: file.name, data };
}

async function privateFileUrl(path: string): Promise<string> {
  if (!path || path === "[purged]") {
    throw new Error("This file has been deleted after the retention window.");
  }
  const base = apiBase();
  if (!base) throw new Error("Okavo API is not configured");
  const token = await getAccessToken();
  const response = await fetch(`${base}/v1/files/${encodeURIComponent(path)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || "Could not open that file.");
  }
  return URL.createObjectURL(await response.blob());
}

export async function submitIdentity(
  _profileId: string,
  input: IdentitySubmission
) {
  await backend("/v1/identity", {
    body: {
      document_type: input.documentType,
      document_country: input.documentCountry,
      document: await filePayload(input.document),
      selfie: input.selfie ? await filePayload(input.selfie) : null,
    },
  });
}

export async function submitInterview(_profileId: string) {
  await backend("/v1/developer/interview", { body: {} });
}

export type ExternalPaymentProof = {
  milestoneId: string;
  reference: string | null;
  proofPath: string | null;
  paidAt: string;
};

export async function fetchExternalPaymentProofs(
  milestoneIds: string[]
): Promise<ExternalPaymentProof[]> {
  if (milestoneIds.length === 0) return [];
  const { proofs } = await backend<{ proofs: any[] }>(
    `/v1/milestone-proofs?ids=${encodeURIComponent(milestoneIds.join(","))}`
  );
  return (proofs ?? []).map((row) => ({
    milestoneId: row.milestone_id as string,
    reference: (row.payer_reference as string | null) ?? null,
    proofPath: (row.proof_storage_path as string | null) ?? null,
    paidAt: formatDate(row.paid_at as string),
  }));
}

export async function signedPaymentProofUrl(path: string): Promise<string> {
  return privateFileUrl(path);
}

export async function fundMilestone(
  milestoneId: string,
  reference?: string,
  proof?: File | null,
  _profileId?: string
) {
  await backend(`/v1/milestones/${milestoneId}/fund`, {
    body: {
      reference: reference?.trim() || null,
      proof: proof ? await filePayload(proof) : null,
    },
  });
  logAudit("milestone.fund", "milestone", milestoneId);
}

export async function submitMilestone(
  milestoneId: string,
  _developerId: string,
  summary: string,
  previewUrl: string
) {
  await backend(`/v1/milestones/${milestoneId}/submit`, {
    body: { summary, preview_url: previewUrl },
  });
}

export async function acceptMilestone(milestoneId: string) {
  await backend(`/v1/milestones/${milestoneId}/accept`, { body: {} });
  logAudit("milestone.accept", "milestone", milestoneId);
}

export async function createChangeOrder(
  projectId: string,
  _raisedBy: string,
  title: string,
  description: string
) {
  await backend(`/v1/projects/${projectId}/change-orders`, {
    body: { title, description },
  });
}

export async function priceChangeOrder(
  changeOrderId: string,
  amount: number,
  addedWeeks: number
) {
  await backend(`/v1/change-orders/${changeOrderId}/price`, {
    body: { amount_cents: toCents(amount), added_weeks: addedWeeks },
  });
}

export async function decideChangeOrder(
  _projectId: string,
  changeOrderId: string,
  accepted: boolean
) {
  await backend(`/v1/change-orders/${changeOrderId}/decide`, {
    body: { accepted },
  });
}

export async function countersignContract(projectId: string) {
  await backend(`/v1/projects/${projectId}/countersign`, { body: {} });
  logAudit("contract.countersign", "project", projectId);
}

export async function inviteBuilderToProject(projectId: string, email: string) {
  const { token } = await backend<{ token: string }>(
    `/v1/projects/${projectId}/invites`,
    { body: { email } }
  );
  return token;
}

export async function acceptProjectInvite(token: string) {
  const { project_id: projectId } = await backend<{ project_id: string }>(
    "/v1/invites/accept",
    { body: { token } }
  );
  return projectId;
}

export type ClarificationRequest = {
  id: string;
  projectId: string;
  developerId: string;
  scopeItemId: string | null;
  question: string;
  answer: string | null;
  createdAt: string;
  answeredAt: string | null;
};

export async function fetchClarifications(
  projectId: string
): Promise<ClarificationRequest[]> {
  const { clarifications } = await backend<{ clarifications: any[] }>(
    `/v1/projects/${projectId}/clarifications`
  );
  return (clarifications ?? []).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    developerId: row.developer_id,
    scopeItemId: row.scope_item_id,
    question: row.question,
    answer: row.answer,
    createdAt: formatDate(row.created_at),
    answeredAt: row.answered_at ? formatDate(row.answered_at) : null,
  }));
}

export async function askClarification(
  projectId: string,
  _developerId: string,
  question: string,
  scopeItemId?: string | null
) {
  const guard = checkGuardrails("clarification", question);
  if (!guard.ok) {
    logAudit("guardrail.block", "project", projectId, {
      kind: "clarification",
      code: guard.code,
      at: "ask",
    });
    throw new Error(guard.message);
  }
  await backend(`/v1/projects/${projectId}/clarifications`, {
    body: { question: question.trim(), scope_item_id: scopeItemId || null },
  });
  logAudit("clarification.ask", "project", projectId);
}

export async function answerClarification(requestId: string, answer: string) {
  const guard = checkGuardrails("clarification", answer);
  if (!guard.ok) {
    logAudit("guardrail.block", "clarification", requestId, {
      kind: "clarification",
      code: guard.code,
      at: "answer",
    });
    throw new Error(guard.message);
  }
  await backend(`/v1/clarifications/${requestId}/answer`, {
    body: { answer },
  });
  logAudit("clarification.answer", "clarification", requestId);
}

export function buildBiblePayload(project: Project) {
  return {
    format: "okavo.build_bible.v1",
    exportedAt: new Date().toISOString(),
    project: {
      id: project.id,
      title: project.title,
      category: project.category,
      outcome: project.outcome,
      stage: project.stage,
      lockId: project.lockId ?? null,
      lockedAt: project.lockedAt ?? null,
      budgetMinUsd: project.budgetMin,
      budgetMaxUsd: project.budgetMax,
      monthlyOpsUsd: project.monthlyOps,
      timelineWeeks: project.timelineWeeks,
      warrantyDays: project.warrantyDays,
    },
    scope: project.scope.map((item, index) => ({
      position: index,
      id: item.id,
      label: item.label,
      detail: item.detail,
      included: item.included,
      acceptanceCriteria: item.acceptanceCriteria ?? null,
    })),
    milestones: project.milestones.map((milestone, index) => ({
      position: index,
      id: milestone.id,
      title: milestone.title,
      description: milestone.description,
      amountUsd: milestone.amount,
      status: milestone.status,
    })),
  };
}

export function downloadBuildBible(project: Project) {
  const payload = buildBiblePayload(project);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `okavo-build-bible-${project.lockId ?? project.id}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function raiseDispute(
  projectId: string,
  _raisedBy: string,
  reason: string,
  scopeItemIds: string[] = []
) {
  await backend(`/v1/projects/${projectId}/disputes`, {
    body: { reason, scope_item_ids: scopeItemIds },
  });
}

export async function resolveDispute(disputeId: string, note: string) {
  await backend(`/v1/disputes/${disputeId}/resolve`, { body: { note } });
}

export async function leaveReview(
  projectId: string,
  _authorId: string,
  input: { scores: ReviewScores; comment: string }
) {
  await backend(`/v1/projects/${projectId}/reviews`, { body: input });
}

export async function sendMessage(
  threadId: string,
  _senderId: string,
  body: string
) {
  await backend(`/v1/threads/${threadId}/messages`, { body: { body } });
}

export type ReviewItem = {
  id: string;
  developerId: string;
  developerName: string;
  country: string;
  documentType: string;
  documentCountry: string;
  documentPath: string;
  selfiePath: string | null;
  status: string;
  submittedAt: string;
};

export async function fetchVerificationQueue(): Promise<ReviewItem[]> {
  const { items } = await backend<{ items: any[] }>("/v1/admin/verifications");
  return (items ?? []).map((row) => ({
    id: row.id,
    developerId: row.developer_id,
    developerName: row.full_name ?? "Developer",
    country: row.country_code ?? "—",
    documentType: row.document_type,
    documentCountry: row.document_country,
    documentPath: row.document_storage_path ?? "",
    selfiePath: row.selfie_storage_path,
    status: row.status,
    submittedAt: formatDate(row.created_at),
  }));
}

export async function signedDocumentUrl(path: string): Promise<string> {
  return privateFileUrl(path);
}

export async function decideVerification(
  verificationId: string,
  _developerId: string,
  approved: boolean,
  reason?: string
) {
  await backend(`/v1/admin/verifications/${verificationId}`, {
    body: { approved, reason },
  });
}

export type PlatformInsights = {
  buyers: number;
  developers: number;
  verifiedDevelopers: number;
  projects: number;
  lockedProjects: number;
  bids: number;
  feesCollectedCents: number;
  escrowCents: number;
  attestedInProgressCents?: number;
  paymentModel?: string;
  pendingReviews: number;
};

export type LiquidityMetrics = {
  verifiedBuyers: number;
  publishedRequirements: number;
  lockedRequirements: number;
  verifiedDevelopers: number;
  timeToFirstBidHours: number | null;
  timeToFirstBidSamples: number;
  bidsPerRequirement: number | null;
  bidCount: number;
  hireConversion: number | null;
  hiredCount: number;
  disputeRate: number | null;
  disputedContracts: number;
  contractsWithDeveloper: number;
  reviewSla: {
    identity: string;
    exam: string;
    identityFileRetentionDays: number;
  };
  founderSeeds: {
    note: string;
    publishedRequirements: number;
    verifiedDevelopers: number;
  };
};

export async function fetchInsights(): Promise<PlatformInsights> {
  return backend<PlatformInsights>("/v1/admin/insights");
}

export async function fetchLiquidity(): Promise<LiquidityMetrics> {
  return backend<LiquidityMetrics>("/v1/admin/liquidity");
}

export type AnalyticsOverview = {
  pageViews: number;
  uniqueVisitors: number;
  sessions: number;
  newVisitors: number;
  countries: number;
  signedInViews: number;
};

export type BreakdownRow = { label: string; views: number; visitors: number };

export type AnalyticsDimension =
  | "channel"
  | "referrer_host"
  | "country"
  | "city"
  | "device"
  | "browser"
  | "os"
  | "path"
  | "utm_source"
  | "utm_campaign"
  | "language";

export async function fetchAnalyticsOverview(
  days: number
): Promise<AnalyticsOverview> {
  const { overview } = await backend<{ overview: any }>(
    `/v1/admin/analytics/overview?days=${days}`
  );
  return {
    pageViews: Number(overview?.page_views ?? 0),
    uniqueVisitors: Number(overview?.unique_visitors ?? 0),
    sessions: Number(overview?.sessions ?? 0),
    newVisitors: Number(overview?.new_visitors ?? 0),
    countries: Number(overview?.countries ?? 0),
    signedInViews: Number(overview?.signed_in_views ?? 0),
  };
}

export async function fetchAnalyticsBreakdown(
  dimension: AnalyticsDimension,
  days: number,
  maxRows = 12
): Promise<BreakdownRow[]> {
  const { rows } = await backend<{ rows: any[] }>(
    `/v1/admin/analytics/breakdown?dimension=${dimension}&days=${days}&max=${maxRows}`
  );
  return (rows ?? []).map((row) => ({
    label: row.label,
    views: Number(row.views),
    visitors: Number(row.visitors),
  }));
}

export async function fetchAnalyticsDaily(
  days: number
): Promise<{ day: string; views: number; visitors: number }[]> {
  const { rows } = await backend<{ rows: any[] }>(
    `/v1/admin/analytics/daily?days=${days}`
  );
  return (rows ?? []).map((row) => ({
    day: row.day,
    views: Number(row.views),
    visitors: Number(row.visitors),
  }));
}

export type AuditAgeBucket = "7d" | "14d" | "30d" | "older";

export type AuditEventRow = {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  entityType: string;
  entityId: string;
  action: string;
  detail: Record<string, unknown>;
  createdAt: string;
  ageBucket: AuditAgeBucket;
};

export async function fetchAuditBucketCounts(): Promise<
  Record<AuditAgeBucket, number>
> {
  const { counts } = await backend<{ counts: Record<AuditAgeBucket, number> }>(
    "/v1/admin/audit/buckets"
  );
  return counts;
}

export async function fetchAuditEvents(
  bucket: AuditAgeBucket,
  limit = 200,
  offset = 0
): Promise<AuditEventRow[]> {
  const { events } = await backend<{ events: any[] }>(
    `/v1/admin/audit?bucket=${bucket}&limit=${limit}&offset=${offset}`
  );
  return (events ?? []).map((row) => ({
    id: row.id,
    actorId: row.actor_id ?? null,
    actorName: row.actor_name ?? null,
    actorEmail: row.actor_email ?? null,
    actorRole: row.actor_role ?? null,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    detail:
      row.detail && typeof row.detail === "object"
        ? (row.detail as Record<string, unknown>)
        : {},
    createdAt: row.created_at,
    ageBucket: row.age_bucket as AuditAgeBucket,
  }));
}

export async function markNotificationRead(notificationId: string) {
  await backend(`/v1/notifications/${notificationId}/read`, { body: {} });
}

export async function markNotificationsRead(_userId: string) {
  await backend("/v1/notifications/read", { body: {} });
}

export async function hireSuccessFeePaid(bidId: string) {
  const { paid } = await backend<{ paid: boolean }>(`/v1/bids/${bidId}/hire-fee`);
  return Boolean(paid);
}

export async function acceptPlatformTerms(version: string) {
  await backend("/v1/terms", { body: { version } });
  logAudit("terms.accept", "profile", null, { version });
}

export async function hasAcceptedTerms(version: string) {
  const { accepted } = await backend<{ accepted: boolean }>(
    `/v1/terms?version=${encodeURIComponent(version)}`
  );
  return Boolean(accepted);
}

export async function requestDeveloperBlock(
  developerId: string,
  reason: string,
  detail?: string,
  projectId?: string | null
) {
  const { id } = await backend<{ id: string }>("/v1/blocks", {
    body: {
      developer_id: developerId,
      reason,
      detail: detail ?? null,
      project_id: projectId ?? null,
    },
  });
  logAudit("block.request", "developer", developerId, { reason });
  return id;
}

export async function listBlockRequests(
  status: "open" | "approved" | "rejected" = "open"
) {
  const { requests } = await backend<{ requests: any[] }>(
    `/v1/blocks?status=${status}`
  );
  return (requests ?? []).map((row) => ({
    id: row.id as string,
    buyerId: row.buyer_id as string,
    developerId: row.developer_id as string,
    projectId: (row.project_id as string) ?? null,
    reason: row.reason as string,
    detail: (row.detail as string) ?? null,
    status: row.status as string,
    createdAt: formatDate(row.created_at as string),
  }));
}

export async function reviewDeveloperBlock(
  requestId: string,
  approve: boolean,
  adminNote?: string
) {
  await backend(`/v1/blocks/${requestId}/review`, {
    body: { approve, admin_note: adminNote ?? null },
  });
  logAudit(approve ? "block.approve" : "block.reject", "block", requestId);
}

export type OperationsHealth = {
  pendingPayments: number;
  failedEvents24h: number;
  openCriticalEvents: number;
  identityDocumentsDue: number;
  checkedAt: string;
  analyticsIngestConfigured: boolean;
  mailConfigured: boolean;
  checkout: string;
  storage: string;
  r2Enabled: boolean;
  paymentModel: string;
};

export type OperationsEvent = {
  id: string;
  severity: "info" | "warning" | "critical";
  category: string;
  code: string;
  summary: string;
  entityType: string | null;
  entityId: string | null;
  detail: Record<string, unknown>;
  resolvedAt: string | null;
  createdAt: string;
};

export async function fetchOperationsHealth(): Promise<OperationsHealth> {
  const row = await backend<Record<string, unknown>>("/v1/admin/operations");
  return {
    pendingPayments: Number(row.pending_payments ?? 0),
    failedEvents24h: Number(row.failed_events_24h ?? 0),
    openCriticalEvents: Number(row.open_critical_events ?? 0),
    identityDocumentsDue: Number(row.identity_documents_due ?? 0),
    checkedAt: String(row.checked_at ?? ""),
    analyticsIngestConfigured: Boolean(row.analytics_ingest_configured),
    mailConfigured: Boolean(row.mail_configured),
    checkout: String(row.checkout ?? "hosted"),
    storage: String(row.storage ?? "d1"),
    r2Enabled: Boolean(row.r2_enabled),
    paymentModel: String(row.payment_model ?? "attestation"),
  };
}

export async function fetchOperationsEvents(
  limit = 100
): Promise<OperationsEvent[]> {
  const { events } = await backend<{ events: any[] }>(
    `/v1/admin/operations/events?limit=${limit}`
  );
  return (events ?? []).map((row) => ({
    id: String(row.id),
    severity: row.severity as OperationsEvent["severity"],
    category: String(row.category),
    code: String(row.code),
    summary: String(row.summary),
    entityType: row.entity_type ? String(row.entity_type) : null,
    entityId: row.entity_id ? String(row.entity_id) : null,
    detail:
      row.detail && typeof row.detail === "string"
        ? (JSON.parse(row.detail) as Record<string, unknown>)
        : row.detail && typeof row.detail === "object"
          ? (row.detail as Record<string, unknown>)
          : {},
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    createdAt: String(row.created_at),
  }));
}
