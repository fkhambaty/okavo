import { consumeRateLimit } from "./auth.js";
import { HttpError, clampText } from "./http.js";
import {
  examGithubOk,
  examHeuristicScore,
  examLiveHostOk,
  normalizeExamRepoUrl,
  nowIso,
  publicHttpsUrl,
  sha256,
} from "./pure.js";

const WINDOW_MS = 5 * 60 * 60 * 1000;
const SLA_MS = 48 * 60 * 60 * 1000;
const OPEN = ["in_progress", "submitted", "admin_questions"];

function bool(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

async function audit(db, user, action, entityId, detail) {
  await db
    .prepare(
      `INSERT INTO audit_events (id, actor_id, entity_type, entity_id, action, detail, created_at)
       VALUES (?, ?, 'build_exam', ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), user?.id ?? null, entityId || "none", action, JSON.stringify(detail || {}), nowIso())
    .run();
}

async function notify(db, profileId, title, body) {
  if (!profileId) return;
  await db
    .prepare(
      `INSERT INTO notifications (id, profile_id, kind, title, body, link_path, created_at)
       VALUES (?, ?, 'exam', ?, ?, '/app/verification', ?)`,
    )
    .bind(crypto.randomUUID(), profileId, title, body, nowIso())
    .run();
}

function requireUser(user) {
  if (!user?.email_verified_at) throw new HttpError(401, "Sign in again.");
}

function shape(exam, brief) {
  if (!exam) return null;
  let detail = {};
  try {
    detail = JSON.parse(exam.auto_score_detail || "{}");
  } catch {
    detail = {};
  }
  return {
    ...exam,
    auto_score_overall: exam.auto_score_overall === null || exam.auto_score_overall === undefined ? null : Number(exam.auto_score_overall),
    auto_score_detail: detail,
    auto_approval_hold: bool(exam.auto_approval_hold),
    duplicate_repo: bool(exam.duplicate_repo),
    brief: brief
      ? {
          id: brief.id,
          slug: brief.slug,
          title: brief.title,
          summary: brief.summary,
          acceptance: brief.acceptance,
          stack_hint: brief.stack_hint,
        }
      : null,
  };
}

async function withBrief(db, exam) {
  if (!exam) return null;
  const brief = await db.prepare("SELECT * FROM exam_briefs WHERE id = ?").bind(exam.brief_id).first();
  return shape(exam, brief);
}

export async function processAutoApprovals(db) {
  const controls = await db.prepare("SELECT * FROM exam_controls WHERE singleton = 1").first();
  if (bool(controls?.auto_approve_paused ?? 1)) return 0;
  const now = nowIso();
  const due = await db
    .prepare(
      `SELECT id, developer_id FROM build_exams
        WHERE status IN ('submitted', 'admin_questions')
          AND review_deadline_at IS NOT NULL AND review_deadline_at < ?
          AND auto_score_overall >= 70 AND auto_approval_hold = 0`,
    )
    .bind(now)
    .all();
  let count = 0;
  for (const row of due.results || []) {
    const updated = await db
      .prepare(
        `UPDATE build_exams
            SET status = 'approved', auto_approved_at = ?, reviewed_at = ?,
                reviewer_notes = COALESCE(reviewer_notes, ?)
          WHERE id = ? AND status IN ('submitted', 'admin_questions')`,
      )
      .bind(now, now, "Auto-approved after 48 hours with a score of at least 70.", row.id)
      .run();
    if (!Number(updated.meta?.changes || 0)) continue;
    await db
      .prepare("UPDATE developer_profiles SET interview_status = 'approved', updated_at = ? WHERE profile_id = ?")
      .bind(now, row.developer_id)
      .run();
    await audit(db, null, "exam.auto_approve", row.id, { minimum_score: 70 });
    await notify(db, row.developer_id, "Build exam approved", "Your build exam was approved after the review window.");
    count += 1;
  }
  return count;
}

export async function examControls(db, user) {
  requireUser(user);
  const row = await db.prepare("SELECT * FROM exam_controls WHERE singleton = 1").first();
  return {
    controls: {
      starts_paused: bool(row?.starts_paused ?? 0),
      auto_approve_paused: bool(row?.auto_approve_paused ?? 0),
      updated_at: row?.updated_at || nowIso(),
    },
  };
}

export async function setExamControls(db, user, body) {
  requireUser(user);
  if (user.role !== "admin") throw new HttpError(403, "Admin only");
  const starts = body?.starts_paused ? 1 : 0;
  const auto = body?.auto_approve_paused ? 1 : 0;
  const now = nowIso();
  await db
    .prepare("UPDATE exam_controls SET starts_paused = ?, auto_approve_paused = ?, updated_at = ? WHERE singleton = 1")
    .bind(starts, auto, now)
    .run();
  await audit(db, user, "exam.controls.update", user.id, { starts_paused: Boolean(starts), auto_approve_paused: Boolean(auto) });
  return examControls(db, user);
}

export async function myExam(db, user) {
  requireUser(user);
  await processAutoApprovals(db);
  const exam = await db
    .prepare("SELECT * FROM build_exams WHERE developer_id = ? ORDER BY started_at DESC LIMIT 1")
    .bind(user.id)
    .first();
  return { exam: await withBrief(db, exam) };
}

export async function openExams(db, user) {
  requireUser(user);
  if (user.role !== "admin") throw new HttpError(403, "Admin only");
  await processAutoApprovals(db);
  const result = await db
    .prepare("SELECT * FROM build_exams WHERE status IN ('submitted', 'admin_questions') ORDER BY submitted_at")
    .all();
  const exams = [];
  for (const exam of result.results || []) exams.push(await withBrief(db, exam));
  return { exams };
}

export async function startExam(db, user) {
  requireUser(user);
  if (user.role !== "developer") throw new HttpError(403, "Only developers can start the build exam");
  const allowed = await consumeRateLimit(db, await sha256(`exam-start:${user.id}`), 8, 86400);
  if (!allowed) throw new HttpError(429, "Too many exam starts. Try again tomorrow.");
  const controls = await db.prepare("SELECT starts_paused FROM exam_controls WHERE singleton = 1").first();
  if (bool(controls?.starts_paused)) {
    throw new HttpError(409, "New build exams are temporarily paused. Please try again later.");
  }
  const day = nowIso().slice(0, 10);
  const started = await db
    .prepare("SELECT COUNT(*) AS count FROM build_exams WHERE substr(started_at, 1, 10) = ?")
    .bind(day)
    .first();
  if (Number(started?.count || 0) >= 10) {
    throw new HttpError(409, "Today's build exam places are full. New places open at 00:00 UTC.");
  }
  const dev = await db.prepare("SELECT * FROM developer_profiles WHERE profile_id = ?").bind(user.id).first();
  if (!dev || dev.identity_status !== "approved") {
    throw new HttpError(403, "Government ID must be approved before the build exam");
  }
  if (dev.interview_status === "approved") throw new HttpError(409, "Build exam already approved");
  const open = await db
    .prepare("SELECT id FROM build_exams WHERE developer_id = ? AND status IN ('in_progress', 'submitted', 'admin_questions')")
    .bind(user.id)
    .first();
  if (open) throw new HttpError(409, "You already have an open build exam");
  const brief = await db
    .prepare(
      `SELECT * FROM exam_briefs WHERE active = 1
        ORDER BY assignment_count ASC, COALESCE(last_assigned_at, '') ASC LIMIT 1`,
    )
    .first();
  if (!brief) throw new HttpError(503, "No exam briefs configured");
  const now = nowIso();
  const due = new Date(Date.now() + WINDOW_MS).toISOString();
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO build_exams (id, developer_id, brief_id, status, started_at, due_at, created_at)
       VALUES (?, ?, ?, 'in_progress', ?, ?, ?)`,
    )
    .bind(id, user.id, brief.id, now, due, now)
    .run();
  await db
    .prepare("UPDATE exam_briefs SET assignment_count = assignment_count + 1, last_assigned_at = ? WHERE id = ?")
    .bind(now, brief.id)
    .run();
  await db
    .prepare(
      `UPDATE developer_profiles SET interview_status = 'submitted', updated_at = ?
        WHERE profile_id = ? AND interview_status IN ('not_started', 'rejected')`,
    )
    .bind(now, user.id)
    .run();
  await audit(db, user, "exam.start", id, { brief_id: brief.id });
  const exam = await db.prepare("SELECT * FROM build_exams WHERE id = ?").bind(id).first();
  return { exam: shape(exam, brief) };
}

function guardText(kind, value) {
  const text = clampText(value, 2000);
  if (text.length < 8) throw new HttpError(400, `Exam ${kind} is too short`);
  if ((text.match(/https?:\/\//gi) || []).length >= 5) throw new HttpError(400, `Exam ${kind} contains too many links`);
  return text;
}

async function loadOwned(db, user, id, adminOk) {
  const exam = await db.prepare("SELECT * FROM build_exams WHERE id = ?").bind(id).first();
  if (!exam) throw new HttpError(404, "Exam not found");
  if (exam.developer_id !== user.id && !(adminOk && user.role === "admin")) throw new HttpError(403, "Not your exam");
  return exam;
}

export async function submitExam(db, user, id, body) {
  requireUser(user);
  const exam = await loadOwned(db, user, id, false);
  if (exam.status !== "in_progress") throw new HttpError(409, "Exam is not open for submission");
  if (nowIso() > exam.due_at) {
    await db.prepare("UPDATE build_exams SET status = 'expired' WHERE id = ?").bind(id).run();
    throw new HttpError(409, "Exam time window has ended (5 hours)");
  }
  const github = String(body?.github_url || "").trim();
  const live = String(body?.live_url || "").trim();
  if (!examGithubOk(github)) throw new HttpError(400, "Provide an HTTPS GitHub or GitLab repository URL");
  if (!/^https:\/\/\S+$/i.test(live) || !examLiveHostOk(live)) throw new HttpError(400, "Provide a public HTTPS live URL");
  const repo = normalizeExamRepoUrl(github);
  const duplicate = await db
    .prepare("SELECT id FROM build_exams WHERE id != ? AND normalized_repo_url = ? ORDER BY created_at LIMIT 1")
    .bind(id, repo)
    .first();
  const now = nowIso();
  const deadline = new Date(Date.now() + SLA_MS).toISOString();
  await db
    .prepare(
      `UPDATE build_exams
          SET status = 'submitted', submitted_at = ?, github_url = ?, live_url = ?,
              normalized_repo_url = ?, duplicate_repo = ?, duplicate_of_exam_id = ?, review_deadline_at = ?
        WHERE id = ?`,
    )
    .bind(now, github, live, repo, duplicate ? 1 : 0, duplicate?.id || null, deadline, id)
    .run();
  if (duplicate) await db.prepare("UPDATE build_exams SET duplicate_repo = 1 WHERE id = ?").bind(duplicate.id).run();
  await audit(db, user, "exam.submit", id, { normalized_repo_url: repo, duplicate_of_exam_id: duplicate?.id || null });
  const saved = await db.prepare("SELECT * FROM build_exams WHERE id = ?").bind(id).first();
  return { exam: await withBrief(db, saved) };
}

async function probe(raw) {
  const url = publicHttpsUrl(raw);
  if (!url) return false;
  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
      headers: { "user-agent": "OkavoExamCheck/1.0" },
    });
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
}

export async function scoreExam(db, user, id) {
  requireUser(user);
  const exam = await loadOwned(db, user, id, true);
  if (exam.status !== "submitted" && exam.status !== "admin_questions") {
    throw new HttpError(400, "Exam is not in a reviewable state");
  }
  const bucket = await sha256(`exam-score:${user.role}:${user.id}`);
  const allowed = await consumeRateLimit(db, bucket, user.role === "admin" ? 60 : 10, 3600);
  if (!allowed) throw new HttpError(429, "Too many exam analyses. Try again in an hour.");
  const liveOk = await probe(exam.live_url);
  const repoOk = examGithubOk(exam.github_url) ? await probe(exam.github_url) : false;
  const scored = examHeuristicScore({
    githubOk: examGithubOk(exam.github_url),
    liveOk,
    repoOk,
    hostedOk: examLiveHostOk(exam.live_url),
    duplicate: bool(exam.duplicate_repo),
  });
  await db
    .prepare(
      `UPDATE build_exams SET auto_score_overall = ?, auto_score_detail = ?, auto_analyzed_at = ? WHERE id = ?`,
    )
    .bind(scored.overall, JSON.stringify({ checks: scored.checks, source: "heuristic" }), nowIso(), id)
    .run();
  const saved = await db.prepare("SELECT * FROM build_exams WHERE id = ?").bind(id).first();
  return { exam: await withBrief(db, saved), overall: scored.overall };
}

export async function replyExam(db, user, id, body) {
  requireUser(user);
  const exam = await loadOwned(db, user, id, false);
  if (exam.status !== "admin_questions") throw new HttpError(409, "No open admin question on this exam");
  const reply = guardText("reply", body?.reply);
  const extended = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const deadline = exam.review_deadline_at && exam.review_deadline_at > extended ? exam.review_deadline_at : extended;
  await db
    .prepare("UPDATE build_exams SET developer_reply = ?, status = 'submitted', review_deadline_at = ? WHERE id = ?")
    .bind(reply, deadline, id)
    .run();
  await audit(db, user, "exam.reply", id, {});
  return { ok: true };
}

export async function askExam(db, user, id, body) {
  requireUser(user);
  if (user.role !== "admin") throw new HttpError(403, "Admin only");
  const exam = await db.prepare("SELECT * FROM build_exams WHERE id = ?").bind(id).first();
  if (!exam || !OPEN.includes(exam.status) || exam.status === "in_progress") throw new HttpError(409, "Exam not awaiting review");
  const question = guardText("question", body?.question);
  const deadline = new Date(Date.now() + SLA_MS).toISOString();
  await db
    .prepare(
      `UPDATE build_exams
          SET status = 'admin_questions', admin_question = ?, developer_reply = NULL,
              auto_approval_hold = 1, auto_approval_hold_reason = ?, review_deadline_at = ?
        WHERE id = ? AND status IN ('submitted', 'admin_questions')`,
    )
    .bind(question, "Admin requested more information.", deadline, id)
    .run();
  await notify(db, exam.developer_id, "Question on your build exam", question.slice(0, 180));
  await audit(db, user, "exam.question", id, {});
  return { ok: true };
}

export async function holdExam(db, user, id, body) {
  requireUser(user);
  if (user.role !== "admin") throw new HttpError(403, "Admin only");
  const hold = Boolean(body?.hold);
  const reason = clampText(body?.reason, 500);
  if (hold && reason.length < 3) throw new HttpError(400, "Add a short reason for the hold");
  const updated = await db
    .prepare(
      `UPDATE build_exams
          SET auto_approval_hold = ?, auto_approval_hold_reason = ?
        WHERE id = ? AND status IN ('submitted', 'admin_questions')`,
    )
    .bind(hold ? 1 : 0, hold ? reason : null, id)
    .run();
  if (!Number(updated.meta?.changes || 0)) throw new HttpError(409, "Exam not awaiting review");
  await audit(db, user, hold ? "exam.hold.set" : "exam.hold.clear", id, { reason: reason || null });
  return { ok: true };
}

export async function decideExam(db, user, id, body) {
  requireUser(user);
  if (user.role !== "admin") throw new HttpError(403, "Admin only");
  const exam = await db.prepare("SELECT * FROM build_exams WHERE id = ?").bind(id).first();
  if (!exam || (exam.status !== "submitted" && exam.status !== "admin_questions")) {
    throw new HttpError(409, "Exam not awaiting review");
  }
  const approve = Boolean(body?.approve);
  const notes = clampText(body?.notes, 2000) || (approve ? "Approved by review" : "Not accepted");
  const now = nowIso();
  await db
    .prepare(
      `UPDATE build_exams
          SET status = ?, reviewed_by = ?, reviewed_at = ?, reviewer_notes = ?
        WHERE id = ?`,
    )
    .bind(approve ? "approved" : "rejected", user.id, now, notes, id)
    .run();
  await db
    .prepare("UPDATE developer_profiles SET interview_status = ?, updated_at = ? WHERE profile_id = ?")
    .bind(approve ? "approved" : "rejected", now, exam.developer_id)
    .run();
  await notify(
    db,
    exam.developer_id,
    approve ? "Build exam approved" : "Build exam not accepted",
    notes.slice(0, 180),
  );
  await audit(db, user, approve ? "exam.approve" : "exam.reject", id, {});
  return { ok: true };
}
