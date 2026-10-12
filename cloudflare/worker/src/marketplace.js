import { consumeRateLimit } from "./auth.js";
import { deleteFile, purgeExpiredIdentityFiles, setFileExpiry, storePrivateFile } from "./files.js";
import { HttpError, clampText } from "./http.js";
import { IDENTITY_RETENTION_MS, lockReference, nowIso, sha256, timingSafeEqual } from "./pure.js";

function requireUser(user) {
  if (!user?.email_verified_at) throw new HttpError(401, "Sign in again.");
}

function isAdmin(user) {
  return user?.role === "admin";
}

async function audit(db, user, action, entityType, entityId, detail) {
  await db
    .prepare(
      `INSERT INTO audit_events (id, actor_id, entity_type, entity_id, action, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), user?.id ?? null, entityType, entityId || "none", action, JSON.stringify(detail || {}), nowIso())
    .run();
}

async function notify(db, profileId, kind, title, body, link) {
  if (!profileId) return;
  await db
    .prepare(
      `INSERT INTO notifications (id, profile_id, kind, title, body, link_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), profileId, kind, title, body, link || null, nowIso())
    .run();
}

function bool(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

async function projectFor(db, id) {
  const row = await db.prepare("SELECT * FROM projects WHERE id = ?").bind(id).first();
  if (!row) throw new HttpError(404, "Project not found");
  return row;
}

async function assertProjectVisible(project, user) {
  if (isAdmin(user) || project.buyer_id === user.id || project.stage !== "drafting") return;
  throw new HttpError(404, "Project not found");
}

async function contractForProject(db, projectId) {
  return db.prepare("SELECT * FROM contracts WHERE project_id = ?").bind(projectId).first();
}

function party(contract, user) {
  return Boolean(contract && (isAdmin(user) || contract.buyer_id === user.id || contract.developer_id === user.id));
}

export async function listProjects(db, user) {
  requireUser(user);
  const result = await db
    .prepare(
      `SELECT p.*, b.organization_name, b.scale
         FROM projects p
         LEFT JOIN buyer_profiles b ON b.profile_id = p.buyer_id
        WHERE ? = 'admin' OR p.stage != 'drafting' OR p.buyer_id = ?
        ORDER BY p.created_at DESC`,
    )
    .bind(user.role, user.id)
    .all();
  const projects = [];
  for (const row of result.results || []) {
    const scope = await db
      .prepare("SELECT * FROM scope_items WHERE project_id = ? ORDER BY position")
      .bind(row.id)
      .all();
    const stats = await db
      .prepare("SELECT COUNT(*) AS bid_count, MIN(amount_cents) AS lowest_bid_cents FROM bids WHERE project_id = ?")
      .bind(row.id)
      .first();
    const contract = await contractForProject(db, row.id);
    const canSeeBids = isAdmin(user) || row.buyer_id === user.id;
    const bidRows = canSeeBids
      ? await db
          .prepare(
            `SELECT bids.*, profiles.full_name, profiles.country_code, developer_profiles.tier
               FROM bids
               JOIN profiles ON profiles.id = bids.developer_id
               LEFT JOIN developer_profiles ON developer_profiles.profile_id = bids.developer_id
              WHERE bids.project_id = ?`,
          )
          .bind(row.id)
          .all()
      : await db
          .prepare(
            `SELECT bids.*, profiles.full_name, profiles.country_code, developer_profiles.tier
               FROM bids
               JOIN profiles ON profiles.id = bids.developer_id
               LEFT JOIN developer_profiles ON developer_profiles.profile_id = bids.developer_id
              WHERE bids.project_id = ? AND bids.developer_id = ?`,
          )
          .bind(row.id, user.id)
          .all();
    let contractPayload = null;
    if (contract && (party(contract, user) || row.buyer_id === user.id)) {
      const milestones = await db.prepare("SELECT * FROM milestones WHERE contract_id = ? ORDER BY position").bind(contract.id).all();
      const milestonePayload = [];
      for (const milestone of milestones.results || []) {
        const deliverable = await db
          .prepare("SELECT * FROM deliverables WHERE milestone_id = ? ORDER BY submitted_at DESC LIMIT 1")
          .bind(milestone.id)
          .first();
        milestonePayload.push({ ...milestone, deliverables: deliverable ? [deliverable] : [] });
      }
      const changes = await db.prepare("SELECT * FROM change_orders WHERE contract_id = ?").bind(contract.id).all();
      const versions = await db.prepare("SELECT version, reason, created_at FROM contract_versions WHERE contract_id = ?").bind(contract.id).all();
      const disputes = await db.prepare("SELECT * FROM disputes WHERE contract_id = ? ORDER BY created_at DESC LIMIT 1").bind(contract.id).all();
      const reviews = await db.prepare("SELECT * FROM reviews WHERE contract_id = ?").bind(contract.id).all();
      contractPayload = {
        ...contract,
        milestones: milestonePayload,
        change_orders: changes.results || [],
        contract_versions: versions.results || [],
        disputes: (disputes.results || []).map((item) => ({
          ...item,
          scope_item_ids: item.scope_item_ids ? JSON.parse(item.scope_item_ids) : null,
        })),
        reviews: (reviews.results || []).map((item) => ({
          ...item,
          matched_expectation: bool(item.matched_expectation),
        })),
      };
    }
    projects.push({
      ...row,
      buyer_profiles: { organization_name: row.organization_name, scale: row.scale },
      scope_items: (scope.results || []).map((item) => ({ ...item, included: bool(item.included) })),
      bids: (bidRows.results || []).map((bid) => ({
        ...bid,
        developer_profiles: {
          tier: bid.tier,
          profiles: { full_name: bid.full_name, country_code: bid.country_code },
        },
      })),
      contracts: contractPayload,
      _lock: contract?.locked_at
        ? {
            lock_reference: contract.lock_reference,
            locked_at: contract.locked_at,
            warranty_days: contract.warranty_days,
            developer_signed_at: contract.developer_signed_at,
          }
        : null,
      _bidStats: {
        bid_count: Number(stats?.bid_count || 0),
        lowest_bid_cents: stats?.lowest_bid_cents ?? null,
      },
    });
  }
  return { projects };
}

async function directoryRows(db, where, binds) {
  const result = await db
    .prepare(
      `SELECT d.profile_id, p.full_name, p.country_code, d.headline, d.hourly_rate_usd, d.tier,
              d.identity_status, d.bidding_unlocked_at,
              (SELECT COUNT(*) FROM reviews r WHERE r.subject_id = d.profile_id) AS review_count,
              (SELECT AVG(r.rating) FROM reviews r WHERE r.subject_id = d.profile_id) AS rating,
              (SELECT AVG(r.score_scope) FROM reviews r WHERE r.subject_id = d.profile_id) AS rating_scope,
              (SELECT AVG(r.score_quality) FROM reviews r WHERE r.subject_id = d.profile_id) AS rating_quality,
              (SELECT AVG(r.score_communication) FROM reviews r WHERE r.subject_id = d.profile_id) AS rating_communication,
              (SELECT AVG(r.score_timeliness) FROM reviews r WHERE r.subject_id = d.profile_id) AS rating_timeliness,
              (SELECT COUNT(*) FROM reviews r WHERE r.subject_id = d.profile_id AND r.matched_expectation = 1) AS matched_count,
              (SELECT COUNT(*) FROM contracts c WHERE c.developer_id = d.profile_id AND c.status = 'completed') AS contracts_delivered
         FROM developer_profiles d
         JOIN profiles p ON p.id = d.profile_id
        ${where}`,
    )
    .bind(...binds)
    .all();
  return result.results || [];
}

export async function directory(db, user) {
  requireUser(user);
  const rows = await directoryRows(
    db,
    "WHERE d.identity_status = 'approved' AND d.bidding_unlocked_at IS NOT NULL AND d.blocked_at IS NULL",
    [],
  );
  return { developers: rows };
}

export async function developerListing(db, user, id) {
  requireUser(user);
  const rows = await directoryRows(db, "WHERE d.profile_id = ?", [id]);
  return { developer: rows[0] ?? null };
}

export async function developerReviews(db, user, id) {
  requireUser(user);
  const result = await db
    .prepare(
      `SELECT r.id, r.subject_id, r.rating, r.score_scope, r.score_quality, r.score_communication,
              r.score_timeliness, r.matched_expectation, r.comment, r.created_at,
              pr.title AS project_title, bp.organization_name AS buyer_org
         FROM reviews r
         JOIN contracts c ON c.id = r.contract_id
         JOIN projects pr ON pr.id = c.project_id
         JOIN buyer_profiles bp ON bp.profile_id = c.buyer_id
        WHERE r.subject_id = ? AND r.subject_id = c.developer_id
        ORDER BY r.created_at DESC`,
    )
    .bind(id)
    .all();
  return {
    reviews: (result.results || []).map((row) => ({ ...row, matched_expectation: bool(row.matched_expectation) })),
  };
}

export async function developerAccount(db, user) {
  requireUser(user);
  const data = await db
    .prepare(
      `SELECT tier, identity_status, interview_status, bidding_unlocked_at FROM developer_profiles WHERE profile_id = ?`,
    )
    .bind(user.id)
    .first();
  const assessment = await db
    .prepare(
      `SELECT score_security, score_efficiency, score_maintainability, score_recovery
         FROM interview_assessments WHERE developer_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(user.id)
    .first();
  return { account: data, assessment };
}

export async function publishProject(db, user, body) {
  requireUser(user);
  if (user.role !== "buyer" && !isAdmin(user)) throw new HttpError(403, "Only buyers can publish requirements");
  if (!user.terms_accepted_at) throw new HttpError(403, "Accept the Okavo Terms before publishing");
  const title = clampText(body?.title, 160);
  const category = clampText(body?.category, 80);
  const outcome = clampText(body?.outcome, 4000);
  const budgetMin = Number(body?.budget_min_cents);
  const budgetMax = Number(body?.budget_max_cents);
  const monthly = Number(body?.monthly_run_cents || 0);
  const weeks = Number(body?.timeline_weeks);
  if (title.length < 3) throw new HttpError(400, "Title too short");
  if (outcome.length < 20) throw new HttpError(400, "Outcome too short");
  if (!Number.isInteger(budgetMin) || !Number.isInteger(budgetMax) || budgetMin <= 0 || budgetMax < budgetMin) {
    throw new HttpError(400, "Invalid budget");
  }
  if (!Number.isInteger(weeks) || weeks <= 0) throw new HttpError(400, "Invalid timeline");
  if (body?.scale) {
    await db.prepare("UPDATE buyer_profiles SET scale = ?, updated_at = ? WHERE profile_id = ?").bind(clampText(body.scale, 40), nowIso(), user.id).run();
  }
  const projectId = crypto.randomUUID();
  const now = nowIso();
  const consumed = await db
    .prepare(
      `UPDATE payments
          SET consumed_at = ?, project_id = ?, updated_at = ?
        WHERE id = (
          SELECT id FROM payments
           WHERE profile_id = ? AND purpose = 'requirement_posting' AND status = 'paid' AND consumed_at IS NULL
           ORDER BY created_at LIMIT 1
        ) AND consumed_at IS NULL`,
    )
    .bind(now, projectId, now, user.id)
    .run();
  const changes = Number(consumed.meta?.changes ?? 0);
  if (!changes) {
    throw new HttpError(402, "A posting fee must be paid before creating a requirement");
  }
  await db
    .prepare(
      `INSERT INTO projects (
         id, buyer_id, title, category, outcome_statement, stage, budget_min_cents, budget_max_cents,
         monthly_run_cents, timeline_weeks, published_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 'clarifying', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(projectId, user.id, title, category, outcome, budgetMin, budgetMax, monthly, weeks, now, now, now)
    .run();
  const scope = Array.isArray(body?.scope) ? body.scope : [];
  let position = 0;
  for (const item of scope.slice(0, 40)) {
    await db
      .prepare(
        `INSERT INTO scope_items (id, project_id, label, detail, included, acceptance_criteria, position, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        projectId,
        clampText(item.label || "Scope item", 200),
        clampText(item.detail, 2000),
        item.included === false ? 0 : 1,
        clampText(item.acceptance_criteria, 2000) || null,
        position,
        now,
      )
      .run();
    position += 1;
  }
  await audit(db, user, "project.publish", "project", projectId, { title, category });
  return { id: projectId };
}

export async function lockProject(db, user, projectId, body) {
  requireUser(user);
  const project = await projectFor(db, projectId);
  if (project.buyer_id !== user.id && !isAdmin(user)) throw new HttpError(403, "Only the buyer can lock this requirement");
  if (!user.terms_accepted_at) throw new HttpError(403, "Accept the Okavo Terms before locking");
  if (project.stage !== "clarifying" && project.stage !== "drafting") {
    throw new HttpError(409, "This requirement is already locked");
  }
  const now = nowIso();
  let contract = await contractForProject(db, projectId);
  if (!contract) {
    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO contracts (
           id, project_id, buyer_id, lock_reference, status, agreed_monthly_cents, agreed_weeks, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
      )
      .bind(id, projectId, user.id, lockReference(), Number(body?.monthly_ops_cents || project.monthly_run_cents), Number(body?.weeks || project.timeline_weeks), now, now)
      .run();
    contract = await contractForProject(db, projectId);
  }
  const scope = await db.prepare("SELECT * FROM scope_items WHERE project_id = ? ORDER BY position").bind(projectId).all();
  await db
    .prepare(
      `UPDATE contracts
          SET status = 'locked', locked_at = ?, buyer_signed_at = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(now, now, now, contract.id)
    .run();
  await db
    .prepare("UPDATE projects SET stage = 'locked', published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?")
    .bind(now, now, projectId)
    .run();
  await db
    .prepare(
      `INSERT INTO contract_versions (id, contract_id, version, snapshot, reason, created_by, created_at)
       VALUES (?, ?, ?, ?, 'Requirement locked', ?, ?)`,
    )
    .bind(crypto.randomUUID(), contract.id, contract.current_version || 1, JSON.stringify({ scope: scope.results || [] }), user.id, now)
    .run();
  await audit(db, user, "project.lock", "project", projectId, {});
  return { ok: true };
}

export async function placeBid(db, user, projectId, body) {
  requireUser(user);
  if (user.role !== "developer" && !isAdmin(user)) throw new HttpError(403, "Only developers can bid");
  const dev = await db.prepare("SELECT * FROM developer_profiles WHERE profile_id = ?").bind(user.id).first();
  if (!dev || dev.identity_status !== "approved") throw new HttpError(403, "Identity verification must be approved before bidding");
  if (dev.interview_status !== "approved") throw new HttpError(403, "The build exam must be approved before bidding");
  if (!dev.bidding_unlocked_at) throw new HttpError(403, "Bidding membership payment required before bidding");
  if (dev.blocked_at) throw new HttpError(403, "This developer account cannot bid");
  const project = await projectFor(db, projectId);
  if (project.stage !== "locked") throw new HttpError(403, "Bids are only accepted while the requirement is locked");
  if (project.buyer_id === user.id) throw new HttpError(403, "You cannot bid on your own requirement");
  const amount = Number(body?.amount_cents);
  const weeks = Number(body?.delivery_weeks);
  if (!Number.isInteger(amount) || amount <= 0 || !Number.isInteger(weeks) || weeks <= 0) {
    throw new HttpError(400, "Invalid bid");
  }
  const now = nowIso();
  try {
    await db
      .prepare(
        `INSERT INTO bids (
           id, project_id, developer_id, amount_cents, monthly_run_cents, delivery_weeks, message,
           accepts_locked_scope, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(crypto.randomUUID(), projectId, user.id, amount, Number(body?.monthly_run_cents || 0), weeks, clampText(body?.message, 2000), now, now)
      .run();
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw new HttpError(409, "You already bid on this requirement");
    throw error;
  }
  await notify(db, project.buyer_id, "bid", "New bid", `${user.full_name} bid on ${project.title}`, `/app/project/${projectId}`);
  await audit(db, user, "bid.place", "project", projectId, { amount_cents: amount, weeks });
  return { ok: true };
}

export async function setBidStatus(db, user, bidId, body) {
  requireUser(user);
  const bid = await db.prepare("SELECT * FROM bids WHERE id = ?").bind(bidId).first();
  if (!bid) throw new HttpError(404, "Bid not found");
  const project = await projectFor(db, bid.project_id);
  const status = clampText(body?.status, 20);
  const allowed = new Set(["submitted", "shortlisted", "declined", "withdrawn"]);
  if (!allowed.has(status)) throw new HttpError(400, "Unsupported bid status");
  if (status === "withdrawn" && bid.developer_id !== user.id) throw new HttpError(403, "Only the bidder can withdraw");
  if (status !== "withdrawn" && project.buyer_id !== user.id && !isAdmin(user)) {
    throw new HttpError(403, "Only the buyer can change this bid");
  }
  if (bid.status === "awarded") throw new HttpError(409, "An awarded bid cannot be changed here");
  await db.prepare("UPDATE bids SET status = ?, updated_at = ? WHERE id = ?").bind(status, nowIso(), bidId).run();
  return { ok: true };
}

export async function awardBid(db, user, bidId) {
  requireUser(user);
  const bid = await db.prepare("SELECT * FROM bids WHERE id = ?").bind(bidId).first();
  if (!bid) throw new HttpError(404, "Bid not found");
  const project = await projectFor(db, bid.project_id);
  if (project.buyer_id !== user.id && !isAdmin(user)) throw new HttpError(403, "Only the buyer can award");
  const paid = await db
    .prepare("SELECT id FROM payments WHERE bid_id = ? AND purpose = 'platform_fee' AND status = 'paid'")
    .bind(bidId)
    .first();
  if (!paid) throw new HttpError(402, "Pay Okavo’s 10% hire success fee before awarding. This keeps deals on-platform.");
  const contract = await contractForProject(db, project.id);
  if (!contract) throw new HttpError(409, "Lock the requirement before awarding");
  const now = nowIso();
  await db.prepare("UPDATE bids SET status = 'declined', updated_at = ? WHERE project_id = ? AND id != ?").bind(now, project.id, bidId).run();
  await db.prepare("UPDATE bids SET status = 'awarded', updated_at = ? WHERE id = ?").bind(now, bidId).run();
  await db
    .prepare(
      `UPDATE contracts
          SET developer_id = ?, agreed_amount_cents = ?, agreed_weeks = ?, developer_signed_at = NULL, updated_at = ?
        WHERE id = ?`,
    )
    .bind(bid.developer_id, bid.amount_cents, bid.delivery_weeks, now, contract.id)
    .run();
  await db.prepare("UPDATE projects SET stage = 'hired', updated_at = ? WHERE id = ?").bind(now, project.id).run();
  const existing = await db.prepare("SELECT id FROM milestones WHERE contract_id = ?").bind(contract.id).first();
  if (!existing) {
    const amount = Math.round(bid.amount_cents / 100);
    const first = Math.round(amount * 0.2) * 100;
    const second = Math.round(amount * 0.4) * 100;
    const third = bid.amount_cents - first - second;
    const slices = [
      ["Foundation (small first slice)", "First locked flows only — keep this milestone small so the buyer never prepays the whole build.", first, 0],
      ["Main functionality", "The bulk of the locked scope, demoed against acceptance lines.", second, 1],
      ["Acceptance and handover", "Remaining scope verified, documentation and deployment.", third, 2],
    ];
    for (const [title, description, cents, position] of slices) {
      if (cents <= 0) continue;
      await db
        .prepare(
          `INSERT INTO milestones (id, contract_id, title, description, amount_cents, position, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(crypto.randomUUID(), contract.id, title, description, cents, position, now)
        .run();
    }
  }
  await notify(db, bid.developer_id, "contract", "You were hired", project.title, `/app/project/${project.id}`);
  await audit(db, user, "bid.award", "project", project.id, { bidId, amount_cents: bid.amount_cents });
  return { ok: true };
}

export async function postingCount(db, user) {
  requireUser(user);
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM payments WHERE profile_id = ? AND purpose = 'requirement_posting' AND status = 'paid'")
    .bind(user.id)
    .first();
  return { count: Number(row?.count || 0) };
}

export async function unconsumedPosting(db, user) {
  requireUser(user);
  const row = await db
    .prepare(
      `SELECT id FROM payments
        WHERE profile_id = ? AND purpose = 'requirement_posting' AND status = 'paid' AND consumed_at IS NULL
        LIMIT 1`,
    )
    .bind(user.id)
    .first();
  return { unconsumed: Boolean(row) };
}

export async function listThreads(db, user) {
  requireUser(user);
  const result = await db
    .prepare(
      `SELECT t.*, bp.full_name AS buyer_name, dp.full_name AS developer_name
         FROM message_threads t
         JOIN profiles bp ON bp.id = t.buyer_id
         JOIN profiles dp ON dp.id = t.developer_id
        WHERE t.buyer_id = ? OR t.developer_id = ? OR ? = 'admin'
        ORDER BY t.last_message_at DESC`,
    )
    .bind(user.id, user.id, user.role)
    .all();
  const threads = [];
  for (const thread of result.results || []) {
    const messages = await db.prepare("SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at").bind(thread.id).all();
    threads.push({
      ...thread,
      buyer: { full_name: thread.buyer_name },
      developer: { full_name: thread.developer_name },
      messages: messages.results || [],
    });
  }
  return { threads };
}

export async function openThread(db, user, body) {
  requireUser(user);
  const project = await projectFor(db, body?.project_id);
  await assertProjectVisible(project, user);
  const developerId = clampText(body?.developer_id, 80);
  if (user.id !== project.buyer_id && user.id !== developerId && !isAdmin(user)) {
    throw new HttpError(403, "You are not part of this conversation");
  }
  const existing = await db
    .prepare("SELECT id FROM message_threads WHERE project_id = ? AND developer_id = ?")
    .bind(project.id, developerId)
    .first();
  if (existing) return { id: existing.id };
  const id = crypto.randomUUID();
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO message_threads (id, project_id, buyer_id, developer_id, subject, last_message_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, project.id, project.buyer_id, developerId, project.title, now, now)
    .run();
  return { id };
}

export async function sendMessage(db, user, threadId, body) {
  requireUser(user);
  const thread = await db.prepare("SELECT * FROM message_threads WHERE id = ?").bind(threadId).first();
  if (!thread || (thread.buyer_id !== user.id && thread.developer_id !== user.id && !isAdmin(user))) {
    throw new HttpError(404, "Conversation not found");
  }
  const text = clampText(body?.body, 4000);
  if (!text) throw new HttpError(400, "Message is empty");
  const now = nowIso();
  await db
    .prepare("INSERT INTO messages (id, thread_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), threadId, user.id, text, now)
    .run();
  await db.prepare("UPDATE message_threads SET last_message_at = ? WHERE id = ?").bind(now, threadId).run();
  const other = thread.buyer_id === user.id ? thread.developer_id : thread.buyer_id;
  await notify(db, other, "message", "New message", text.slice(0, 140), "/app/messages");
  return { ok: true };
}

export async function listNotifications(db, user) {
  requireUser(user);
  const result = await db
    .prepare("SELECT * FROM notifications WHERE profile_id = ? ORDER BY created_at DESC LIMIT 50")
    .bind(user.id)
    .all();
  return { notifications: result.results || [] };
}

export async function markRead(db, user, id) {
  requireUser(user);
  if (id) {
    await db
      .prepare("UPDATE notifications SET read_at = ? WHERE id = ? AND profile_id = ? AND read_at IS NULL")
      .bind(nowIso(), id, user.id)
      .run();
  } else {
    await db
      .prepare("UPDATE notifications SET read_at = ? WHERE profile_id = ? AND read_at IS NULL")
      .bind(nowIso(), user.id)
      .run();
  }
  return { ok: true };
}

export async function countersign(db, user, projectId) {
  requireUser(user);
  if (!user.terms_accepted_at) throw new HttpError(403, "Accept the Okavo Terms before countersigning");
  const contract = await contractForProject(db, projectId);
  if (!contract) throw new HttpError(404, "Contract not found");
  if (contract.developer_id !== user.id) throw new HttpError(403, "Only the awarded developer can countersign");
  if (contract.developer_signed_at) return { ok: true };
  const now = nowIso();
  await db
    .prepare("UPDATE contracts SET developer_signed_at = ?, status = 'active', updated_at = ? WHERE id = ?")
    .bind(now, now, contract.id)
    .run();
  await db.prepare("UPDATE projects SET stage = 'in_delivery', updated_at = ? WHERE id = ? AND stage = 'hired'").bind(now, projectId).run();
  await db
    .prepare("UPDATE milestones SET status = 'in_progress' WHERE contract_id = ? AND position = 0 AND status = 'pending'")
    .bind(contract.id)
    .run();
  await audit(db, user, "contract.countersign", "project", projectId, {});
  return { ok: true };
}

export async function submitMilestone(db, user, milestoneId, body) {
  requireUser(user);
  const milestone = await db.prepare("SELECT * FROM milestones WHERE id = ?").bind(milestoneId).first();
  if (!milestone) throw new HttpError(404, "Milestone not found");
  const contract = await db.prepare("SELECT * FROM contracts WHERE id = ?").bind(milestone.contract_id).first();
  if (contract?.developer_id !== user.id) throw new HttpError(403, "Only the hired developer can submit this milestone");
  if (!contract.developer_signed_at) throw new HttpError(403, "Countersign the lock before submitting work");
  const summary = clampText(body?.summary, 4000);
  if (summary.length < 8) throw new HttpError(400, "Describe what you are handing over");
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO deliverables (id, milestone_id, developer_id, summary, preview_url, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), milestoneId, user.id, summary, clampText(body?.preview_url, 500) || null, now)
    .run();
  await db.prepare("UPDATE milestones SET status = 'submitted', submitted_at = ? WHERE id = ?").bind(now, milestoneId).run();
  await notify(db, contract.buyer_id, "milestone", "Work submitted", summary.slice(0, 140), `/app/contract/${contract.project_id}`);
  return { ok: true };
}

export async function acceptMilestone(db, user, milestoneId) {
  requireUser(user);
  const milestone = await db.prepare("SELECT * FROM milestones WHERE id = ?").bind(milestoneId).first();
  if (!milestone) throw new HttpError(404, "Milestone not found");
  const contract = await db.prepare("SELECT * FROM contracts WHERE id = ?").bind(milestone.contract_id).first();
  if (contract?.buyer_id !== user.id && !isAdmin(user)) throw new HttpError(403, "Only the buyer can accept this milestone");
  if (milestone.status !== "submitted") throw new HttpError(409, "Milestone must be submitted before it can be accepted");
  const now = nowIso();
  await db.prepare("UPDATE milestones SET status = 'accepted', accepted_at = ? WHERE id = ?").bind(now, milestoneId).run();
  await audit(db, user, "milestone.accept", "milestone", milestoneId, {});
  return { ok: true };
}

export async function fundMilestone(db, user, milestoneId, body) {
  requireUser(user);
  const milestone = await db.prepare("SELECT * FROM milestones WHERE id = ?").bind(milestoneId).first();
  if (!milestone) throw new HttpError(404, "Milestone not found");
  const contract = await db.prepare("SELECT * FROM contracts WHERE id = ?").bind(milestone.contract_id).first();
  const project = await projectFor(db, contract.project_id);
  if (contract.buyer_id !== user.id) throw new HttpError(403, "Only the buyer can attest payment");
  if (!["hired", "in_delivery", "delivered"].includes(project.stage)) throw new HttpError(409, "Project is not in a payable stage");
  if (milestone.status === "released") return { ok: true };
  if (milestone.status !== "accepted") {
    throw new HttpError(409, "Accept the work before recording an outside payment");
  }
  const existing = await db
    .prepare("SELECT id FROM payments WHERE milestone_id = ? AND provider = 'external' AND status = 'paid'")
    .bind(milestoneId)
    .first();
  if (existing) return { ok: true };
  let proofId = null;
  if (body?.proof?.data) {
    const stored = await storePrivateFile(db, {
      ownerId: user.id,
      purpose: "payment_proof",
      mime: body.proof.mime,
      data: body.proof.data,
    });
    proofId = stored.id;
  }
  const now = nowIso();
  try {
    await db
      .prepare(
        `INSERT INTO payments (
           id, profile_id, purpose, status, amount_cents, currency, provider, provider_reference,
           contract_id, milestone_id, project_id, payer_reference, proof_storage_path, paid_at, created_at, updated_at
         ) VALUES (?, ?, 'milestone_funding', 'paid', ?, 'USD', 'external', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        user.id,
        milestone.amount_cents,
        `external:${milestoneId}`,
        contract.id,
        milestoneId,
        project.id,
        clampText(body?.reference, 160) || null,
        proofId,
        now,
        now,
        now,
      )
      .run();
  } catch (error) {
    if (proofId) await deleteFile(db, proofId);
    throw error;
  }
  await db
    .prepare("UPDATE milestones SET status = 'released', funded_at = COALESCE(funded_at, ?), released_at = COALESCE(released_at, ?) WHERE id = ?")
    .bind(now, now, milestoneId)
    .run();
  const next = await db
    .prepare("SELECT id FROM milestones WHERE contract_id = ? AND status = 'pending' ORDER BY position LIMIT 1")
    .bind(contract.id)
    .first();
  if (next) await db.prepare("UPDATE milestones SET status = 'in_progress' WHERE id = ?").bind(next.id).run();
  await notify(db, contract.developer_id, "payment", "Milestone paid", `The buyer confirmed payment for "${milestone.title}" after accepting the work.`, `/app/contract/${project.id}`);
  await audit(db, user, "milestone.fund", "milestone", milestoneId, { mode: "accept_then_pay" });
  return { ok: true };
}

export async function externalProofs(db, user, ids) {
  requireUser(user);
  if (!ids.length) return { proofs: [] };
  const placeholders = ids.map(() => "?").join(",");
  const result = await db
    .prepare(
      `SELECT payments.milestone_id, payments.payer_reference, payments.proof_storage_path, payments.paid_at
         FROM payments
         JOIN milestones ON milestones.id = payments.milestone_id
         JOIN contracts ON contracts.id = milestones.contract_id
        WHERE payments.milestone_id IN (${placeholders})
          AND payments.provider = 'external' AND payments.status = 'paid'
          AND (contracts.buyer_id = ? OR contracts.developer_id = ? OR ? = 'admin')`,
    )
    .bind(...ids, user.id, user.id, user.role)
    .all();
  return { proofs: result.results || [] };
}

async function changeOrderAccess(db, user, id) {
  const order = await db.prepare("SELECT * FROM change_orders WHERE id = ?").bind(id).first();
  if (!order) throw new HttpError(404, "Change order not found");
  const contract = await db.prepare("SELECT * FROM contracts WHERE id = ?").bind(order.contract_id).first();
  if (!party(contract, user)) throw new HttpError(403, "You are not a party to this contract");
  return { order, contract };
}

export async function createChangeOrder(db, user, projectId, body) {
  requireUser(user);
  const contract = await contractForProject(db, projectId);
  if (!party(contract, user)) throw new HttpError(403, "You are not a party to this contract");
  await db
    .prepare(
      `INSERT INTO change_orders (id, contract_id, raised_by, title, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), contract.id, user.id, clampText(body?.title, 160), clampText(body?.description, 4000), nowIso())
    .run();
  return { ok: true };
}

export async function priceChangeOrder(db, user, id, body) {
  const { order, contract } = await changeOrderAccess(db, user, id);
  if (contract.developer_id !== user.id && !isAdmin(user)) throw new HttpError(403, "Only the developer can price this change");
  const amount = Number(body?.amount_cents);
  const weeks = Number(body?.added_weeks || 0);
  if (!Number.isInteger(amount) || amount < 0) throw new HttpError(400, "Invalid price");
  await db
    .prepare("UPDATE change_orders SET status = 'priced', amount_cents = ?, added_weeks = ? WHERE id = ?")
    .bind(amount, weeks, order.id)
    .run();
  return { ok: true };
}

export async function decideChangeOrder(db, user, id, body) {
  const { order, contract } = await changeOrderAccess(db, user, id);
  if (contract.buyer_id !== user.id && !isAdmin(user)) throw new HttpError(403, "Only the buyer can decide this change");
  const accepted = Boolean(body?.accepted);
  const now = nowIso();
  await db.prepare("UPDATE change_orders SET status = ?, decided_at = ? WHERE id = ?").bind(accepted ? "accepted" : "declined", now, order.id).run();
  if (!accepted) return { ok: true };
  const project = await projectFor(db, contract.project_id);
  const count = await db.prepare("SELECT COUNT(*) AS count FROM scope_items WHERE project_id = ?").bind(project.id).first();
  await db
    .prepare(
      `INSERT INTO scope_items (id, project_id, label, detail, included, position, created_at)
       VALUES (?, ?, ?, 'Added by an accepted change order.', 1, ?, ?)`,
    )
    .bind(crypto.randomUUID(), project.id, order.title, Number(count?.count || 0), now)
    .run();
  await db
    .prepare("UPDATE projects SET timeline_weeks = timeline_weeks + ?, updated_at = ? WHERE id = ?")
    .bind(Number(order.added_weeks || 0), now, project.id)
    .run();
  const nextVersion = Number(contract.current_version || 1) + 1;
  await db.prepare("UPDATE contracts SET current_version = ?, updated_at = ? WHERE id = ?").bind(nextVersion, now, contract.id).run();
  const scope = await db.prepare("SELECT * FROM scope_items WHERE project_id = ? ORDER BY position").bind(project.id).all();
  await db
    .prepare(
      `INSERT INTO contract_versions (id, contract_id, version, snapshot, reason, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      contract.id,
      nextVersion,
      JSON.stringify({ scope: scope.results || [], change_order: { title: order.title, amount_cents: order.amount_cents, added_weeks: order.added_weeks } }),
      `Change order accepted: ${order.title}`,
      user.id,
      now,
    )
    .run();
  return { ok: true };
}

export async function raiseDispute(db, user, projectId, body) {
  requireUser(user);
  const contract = await contractForProject(db, projectId);
  if (!party(contract, user)) throw new HttpError(403, "You are not a party to this contract");
  const reason = clampText(body?.reason, 4000);
  if (reason.length < 8) throw new HttpError(400, "Describe the dispute");
  await db
    .prepare(
      `INSERT INTO disputes (id, contract_id, raised_by, reason, scope_item_ids, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), contract.id, user.id, reason, JSON.stringify(body?.scope_item_ids || []), nowIso())
    .run();
  await db.prepare("UPDATE contracts SET status = 'disputed', updated_at = ? WHERE id = ?").bind(nowIso(), contract.id).run();
  return { ok: true };
}

export async function resolveDispute(db, user, id, body) {
  requireUser(user);
  if (!isAdmin(user)) throw new HttpError(403, "Only an admin can resolve a dispute");
  const note = clampText(body?.note, 4000);
  await db
    .prepare("UPDATE disputes SET status = 'resolved_buyer', resolution_note = ?, resolved_by = ?, resolved_at = ? WHERE id = ?")
    .bind(note, user.id, nowIso(), id)
    .run();
  return { ok: true };
}

export async function leaveReview(db, user, projectId, body) {
  requireUser(user);
  const contract = await contractForProject(db, projectId);
  if (!party(contract, user)) throw new HttpError(403, "You are not a party to this contract");
  const scores = body?.scores || {};
  const values = [scores.scope, scores.quality, scores.communication, scores.timeliness].map(Number);
  if (values.some((value) => !Number.isInteger(value) || value < 1 || value > 5)) {
    throw new HttpError(400, "Each score must be from 1 to 5");
  }
  const subjectId = contract.developer_id === user.id ? contract.buyer_id : contract.developer_id;
  const rating = values.reduce((sum, value) => sum + value, 0) / 4;
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO reviews (
         id, contract_id, author_id, subject_id, rating, score_scope, score_quality,
         score_communication, score_timeliness, matched_expectation, comment, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), contract.id, user.id, subjectId, rating, ...values, values[0] >= 4 ? 1 : 0, clampText(body?.comment, 4000), now)
    .run();
  await db.prepare("UPDATE projects SET stage = 'closed', updated_at = ? WHERE id = ?").bind(now, projectId).run();
  await db.prepare("UPDATE contracts SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?").bind(now, now, contract.id).run();
  return { ok: true };
}

export async function clarifications(db, user, projectId) {
  requireUser(user);
  const project = await projectFor(db, projectId);
  await assertProjectVisible(project, user);
  const result = await db
    .prepare("SELECT * FROM clarification_requests WHERE project_id = ? ORDER BY created_at")
    .bind(projectId)
    .all();
  const rows = result.results || [];
  if (project.buyer_id === user.id || isAdmin(user)) return { clarifications: rows };
  return { clarifications: rows.filter((row) => row.developer_id === user.id || row.answer) };
}

export async function askClarification(db, user, projectId, body) {
  requireUser(user);
  const project = await projectFor(db, projectId);
  if (project.stage !== "clarifying" && project.stage !== "locked") throw new HttpError(409, "Questions are closed for this requirement");
  if (user.role !== "developer" && !isAdmin(user)) throw new HttpError(403, "Only a developer can ask");
  const question = clampText(body?.question, 2000);
  if (question.length < 8) throw new HttpError(400, "Ask a specific question");
  await db
    .prepare(
      `INSERT INTO clarification_requests (id, project_id, developer_id, scope_item_id, question, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), projectId, user.id, body?.scope_item_id || null, question, nowIso())
    .run();
  await audit(db, user, "clarification.ask", "project", projectId, {});
  return { ok: true };
}

export async function answerClarification(db, user, id, body) {
  requireUser(user);
  const row = await db.prepare("SELECT * FROM clarification_requests WHERE id = ?").bind(id).first();
  if (!row) throw new HttpError(404, "Question not found");
  const project = await projectFor(db, row.project_id);
  if (project.buyer_id !== user.id && !isAdmin(user)) throw new HttpError(403, "Only the buyer can answer");
  const answer = clampText(body?.answer, 4000);
  if (answer.length < 2) throw new HttpError(400, "Write an answer");
  await db.prepare("UPDATE clarification_requests SET answer = ?, answered_at = ? WHERE id = ?").bind(answer, nowIso(), id).run();
  await audit(db, user, "clarification.answer", "clarification", id, {});
  return { ok: true };
}

export async function acceptTerms(db, user, body) {
  requireUser(user);
  const version = clampText(body?.version, 40);
  if (!version) throw new HttpError(400, "Missing terms version");
  const now = nowIso();
  await db.prepare("UPDATE profiles SET terms_version = ?, terms_accepted_at = ?, updated_at = ? WHERE id = ?").bind(version, now, now, user.id).run();
  await audit(db, user, "terms.accept", "profile", user.id, { version });
  return { ok: true };
}

export async function termsAccepted(db, user, version) {
  requireUser(user);
  return { accepted: user.terms_version === version && Boolean(user.terms_accepted_at) };
}

export async function hireFeePaid(db, user, bidId) {
  requireUser(user);
  const row = await db
    .prepare("SELECT id FROM payments WHERE bid_id = ? AND purpose = 'platform_fee' AND status = 'paid'")
    .bind(bidId)
    .first();
  return { paid: Boolean(row) };
}

export async function requestBlock(db, user, body) {
  requireUser(user);
  if (user.role !== "buyer" && !isAdmin(user)) throw new HttpError(403, "Only a buyer can request a block");
  const developerId = clampText(body?.developer_id, 80);
  if (!developerId || developerId === user.id) throw new HttpError(400, "Choose a developer");
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO developer_block_requests (id, buyer_id, developer_id, project_id, reason, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, user.id, developerId, body?.project_id || null, clampText(body?.reason, 80), clampText(body?.detail, 2000) || null, nowIso())
    .run();
  await audit(db, user, "block.request", "developer", developerId, { reason: body?.reason });
  return { id };
}

export async function listBlocks(db, user, status) {
  requireUser(user);
  if (!isAdmin(user)) throw new HttpError(403, "Admin only");
  const result = await db
    .prepare("SELECT * FROM developer_block_requests WHERE status = ? ORDER BY created_at DESC LIMIT 100")
    .bind(status || "open")
    .all();
  return { requests: result.results || [] };
}

export async function reviewBlock(db, user, id, body) {
  requireUser(user);
  if (!isAdmin(user)) throw new HttpError(403, "Admin only");
  const row = await db.prepare("SELECT * FROM developer_block_requests WHERE id = ?").bind(id).first();
  if (!row) throw new HttpError(404, "Request not found");
  const approve = Boolean(body?.approve);
  const now = nowIso();
  await db
    .prepare("UPDATE developer_block_requests SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?")
    .bind(approve ? "approved" : "rejected", clampText(body?.admin_note, 2000) || null, user.id, now, id)
    .run();
  if (approve) {
    await db.prepare("UPDATE developer_profiles SET blocked_at = ?, updated_at = ? WHERE profile_id = ?").bind(now, now, row.developer_id).run();
  }
  await audit(db, user, approve ? "block.approve" : "block.reject", "block", id, {});
  return { ok: true };
}

export async function submitInterview(db, user) {
  requireUser(user);
  await db.prepare("UPDATE developer_profiles SET interview_status = 'submitted', updated_at = ? WHERE profile_id = ?").bind(nowIso(), user.id).run();
  return { ok: true };
}

export async function submitIdentity(db, user, body) {
  requireUser(user);
  if (user.role !== "developer") throw new HttpError(403, "Only a developer can submit identity documents");
  const allowed = await consumeRateLimit(db, await sha256(`identity:${user.id}`), 8, 3600);
  if (!allowed) throw new HttpError(429, "Too many identity uploads. Try again in an hour.");
  const dev = await db.prepare("SELECT identity_status FROM developer_profiles WHERE profile_id = ?").bind(user.id).first();
  if (!dev) throw new HttpError(403, "Developer profile not found");
  if (dev.identity_status === "approved") throw new HttpError(409, "Identity is already approved");
  if (dev.identity_status === "submitted") throw new HttpError(409, "Identity documents are already in review");
  const documentType = clampText(body?.document_type, 80);
  const country = clampText(body?.document_country, 80);
  if (!documentType || !country) throw new HttpError(400, "Choose a document type and issuing country");
  if (!body?.document?.data) throw new HttpError(400, "Upload a photo or PDF of the document");
  const document = await storePrivateFile(db, {
    ownerId: user.id,
    purpose: "identity_document",
    mime: body.document.mime,
    data: body.document.data,
  });
  let selfieId = null;
  try {
    if (body?.selfie?.data) {
      const selfie = await storePrivateFile(db, {
        ownerId: user.id,
        purpose: "identity_selfie",
        mime: body.selfie.mime,
        data: body.selfie.data,
      });
      selfieId = selfie.id;
    }
  } catch (error) {
    await deleteFile(db, document.id);
    throw error;
  }
  const previous = await db
    .prepare("SELECT document_storage_path, selfie_storage_path FROM identity_verifications WHERE developer_id = ?")
    .bind(user.id)
    .all();
  for (const row of previous.results || []) {
    await deleteFile(db, row.document_storage_path);
    await deleteFile(db, row.selfie_storage_path);
  }
  const now = nowIso();
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO identity_verifications (
         id, developer_id, status, document_type, document_country, document_storage_path, selfie_storage_path, created_at
       ) VALUES (?, ?, 'submitted', ?, ?, ?, ?, ?)`,
    )
    .bind(id, user.id, documentType, country, document.id, selfieId, now)
    .run();
  await db
    .prepare("UPDATE developer_profiles SET identity_status = 'submitted', updated_at = ? WHERE profile_id = ?")
    .bind(now, user.id)
    .run();
  const admins = await db.prepare("SELECT id FROM profiles WHERE role = 'admin'").all();
  for (const admin of admins.results || []) {
    await notify(db, admin.id, "verification", "Identity document to review", `${user.full_name} submitted a ${documentType}.`, "/app/verifications");
  }
  await audit(db, user, "identity.submit", "verification", id, { document_type: documentType });
  return { id };
}

export async function verificationQueue(db, user) {
  requireUser(user);
  if (!isAdmin(user)) throw new HttpError(403, "Admin only");
  await purgeExpiredIdentityFiles(db);
  const result = await db
    .prepare(
      `SELECT v.*, p.full_name, p.country_code
         FROM identity_verifications v
         LEFT JOIN profiles p ON p.id = v.developer_id
        ORDER BY v.created_at`,
    )
    .all();
  return { items: result.results || [] };
}

export async function decideVerification(db, user, id, body) {
  requireUser(user);
  if (!isAdmin(user)) throw new HttpError(403, "Admin only");
  const row = await db.prepare("SELECT * FROM identity_verifications WHERE id = ?").bind(id).first();
  if (!row) throw new HttpError(404, "Verification not found");
  const approved = Boolean(body?.approved);
  const now = nowIso();
  const expires = new Date(Date.now() + IDENTITY_RETENTION_MS).toISOString();
  await db
    .prepare(
      `UPDATE identity_verifications
          SET status = ?, rejection_reason = ?, reviewed_at = ?, reviewed_by = ?, expires_at = ?
        WHERE id = ?`,
    )
    .bind(approved ? "approved" : "rejected", approved ? null : clampText(body?.reason, 500) || "Not legible", now, user.id, expires, id)
    .run();
  await setFileExpiry(db, row.document_storage_path, expires);
  await setFileExpiry(db, row.selfie_storage_path, expires);
  await db
    .prepare("UPDATE developer_profiles SET identity_status = ?, tier = ?, updated_at = ? WHERE profile_id = ?")
    .bind(approved ? "approved" : "rejected", approved ? "verified" : "applicant", now, row.developer_id)
    .run();
  await notify(
    db,
    row.developer_id,
    "verification",
    approved ? "Identity approved" : "Identity not approved",
    approved ? "You can continue to the build exam." : "Upload a clearer photo of the full document.",
    "/app/verification",
  );
  return { ok: true };
}

export async function insights(db, user) {
  requireUser(user);
  if (!isAdmin(user)) throw new HttpError(403, "Admin only");
  const count = async (sql, ...binds) => Number((await db.prepare(sql).bind(...binds).first())?.count || 0);
  const fees = await db.prepare("SELECT amount_cents, purpose, status FROM payments").all();
  const milestones = await db.prepare("SELECT amount_cents, status FROM milestones").all();
  const feesCollectedCents = (fees.results || [])
    .filter((row) => row.status === "paid" && ["bidding_membership", "requirement_posting", "platform_fee"].includes(row.purpose))
    .reduce((sum, row) => sum + Number(row.amount_cents), 0);
  const escrowCents = (milestones.results || [])
    .filter((row) => ["funded", "submitted"].includes(row.status))
    .reduce((sum, row) => sum + Number(row.amount_cents), 0);
  return {
    buyers: await count("SELECT COUNT(*) AS count FROM buyer_profiles"),
    developers: await count("SELECT COUNT(*) AS count FROM developer_profiles"),
    verifiedDevelopers: await count("SELECT COUNT(*) AS count FROM developer_profiles WHERE identity_status = 'approved'"),
    projects: await count("SELECT COUNT(*) AS count FROM projects"),
    lockedProjects: await count("SELECT COUNT(*) AS count FROM projects WHERE stage != 'drafting'"),
    bids: await count("SELECT COUNT(*) AS count FROM bids"),
    feesCollectedCents,
    escrowCents,
    pendingReviews: await count("SELECT COUNT(*) AS count FROM identity_verifications WHERE status = 'submitted'"),
  };
}

export async function operationsHealth(db, user) {
  requireUser(user);
  if (!isAdmin(user)) throw new HttpError(403, "Admin only");
  const count = async (sql) => Number((await db.prepare(sql).first())?.count || 0);
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const day = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const pending = await db
    .prepare("SELECT COUNT(*) AS count FROM payments WHERE status = 'pending' AND created_at < ?")
    .bind(cutoff)
    .first();
  const failed = await db
    .prepare("SELECT COUNT(*) AS count FROM payment_provider_events WHERE status = 'failed' AND received_at > ?")
    .bind(day)
    .first();
  const dueRow = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM identity_verifications
        WHERE expires_at IS NOT NULL AND expires_at <= ? AND COALESCE(document_storage_path, '') != '[purged]'`,
    )
    .bind(nowIso())
    .first();
  const dueBefore = Number(dueRow?.count || 0);
  await purgeExpiredIdentityFiles(db);
  return {
    pending_payments: Number(pending?.count || 0),
    failed_events_24h: Number(failed?.count || 0),
    open_critical_events: await count("SELECT COUNT(*) AS count FROM ops_events WHERE severity = 'critical' AND resolved_at IS NULL"),
    identity_documents_due: dueBefore,
    checked_at: nowIso(),
  };
}

export async function operationsEvents(db, user, limit) {
  requireUser(user);
  if (!isAdmin(user)) throw new HttpError(403, "Admin only");
  const cap = Math.max(1, Math.min(Number(limit) || 100, 500));
  const result = await db.prepare("SELECT * FROM ops_events ORDER BY created_at DESC LIMIT ?").bind(cap).all();
  return { events: result.results || [] };
}

function bucketStart(bucket) {
  const days = bucket === "7d" ? 7 : bucket === "14d" ? 14 : bucket === "30d" ? 30 : null;
  if (!days) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function auditBuckets(db, user) {
  requireUser(user);
  if (!isAdmin(user)) throw new HttpError(403, "Admin only");
  const rows = await db.prepare("SELECT created_at FROM audit_events").all();
  const counts = { "7d": 0, "14d": 0, "30d": 0, older: 0 };
  const now = Date.now();
  for (const row of rows.results || []) {
    const age = now - Date.parse(row.created_at);
    const days = age / 86400000;
    if (days <= 7) counts["7d"] += 1;
    else if (days <= 14) counts["14d"] += 1;
    else if (days <= 30) counts["30d"] += 1;
    else counts.older += 1;
  }
  return { counts };
}

export async function auditEvents(db, user, bucket, limit, offset) {
  requireUser(user);
  if (!isAdmin(user)) throw new HttpError(403, "Admin only");
  const result = await db
    .prepare(
      `SELECT a.*, p.full_name AS actor_name, p.email AS actor_email, p.role AS actor_role
         FROM audit_events a
         LEFT JOIN profiles p ON p.id = a.actor_id
        ORDER BY a.created_at DESC`,
    )
    .all();
  const start = bucketStart(bucket);
  const olderThan = bucket === "older" ? new Date(Date.now() - 30 * 86400000).toISOString() : null;
  const filtered = (result.results || []).filter((row) => {
    if (bucket === "older") return row.created_at < olderThan;
    if (!start) return false;
    const previous = bucket === "7d" ? null : bucket === "14d" ? bucketStart("7d") : bucketStart("14d");
    return row.created_at >= start && (!previous || row.created_at < previous);
  });
  const slice = filtered.slice(Number(offset) || 0, (Number(offset) || 0) + Math.min(Number(limit) || 200, 500));
  return {
    events: slice.map((row) => ({
      ...row,
      detail: JSON.parse(row.detail || "{}"),
      age_bucket: bucket,
    })),
  };
}

export async function writeClientAudit(db, user, body) {
  requireUser(user);
  const action = clampText(body?.action, 80);
  if (!action) return { ok: true };
  await audit(db, user, action, clampText(body?.entity_type, 40) || "session", body?.entity_id || user.id, body?.detail || {});
  return { ok: true };
}

export async function analyticsOverview(db, user, days) {
  requireUser(user);
  if (!isAdmin(user)) throw new HttpError(403, "Admin only");
  const since = new Date(Date.now() - Number(days || 7) * 86400000).toISOString();
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS page_views,
              COUNT(DISTINCT visitor_id) AS unique_visitors,
              COUNT(DISTINCT session_id) AS sessions,
              SUM(CASE WHEN is_new_visitor = 1 THEN 1 ELSE 0 END) AS new_visitors,
              COUNT(DISTINCT country) AS countries,
              SUM(CASE WHEN profile_id IS NOT NULL THEN 1 ELSE 0 END) AS signed_in_views
         FROM site_visits WHERE created_at >= ?`,
    )
    .bind(since)
    .first();
  return { overview: row || {} };
}

const ANALYTICS_COLUMNS = new Set(["channel", "referrer_host", "country", "city", "device", "browser", "os", "path", "utm_source", "utm_campaign", "language"]);

export async function analyticsBreakdown(db, user, dimension, days, maxRows) {
  requireUser(user);
  if (!isAdmin(user)) throw new HttpError(403, "Admin only");
  if (!ANALYTICS_COLUMNS.has(dimension)) throw new HttpError(400, "Unknown dimension");
  const since = new Date(Date.now() - Number(days || 7) * 86400000).toISOString();
  const cap = Math.max(1, Math.min(Number(maxRows) || 12, 50));
  const result = await db
    .prepare(
      `SELECT COALESCE(${dimension}, '(none)') AS label, COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
         FROM site_visits WHERE created_at >= ?
        GROUP BY label ORDER BY views DESC LIMIT ?`,
    )
    .bind(since, cap)
    .all();
  return { rows: result.results || [] };
}

export async function analyticsDaily(db, user, days) {
  requireUser(user);
  if (!isAdmin(user)) throw new HttpError(403, "Admin only");
  const since = new Date(Date.now() - Number(days || 7) * 86400000).toISOString();
  const result = await db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
         FROM site_visits WHERE created_at >= ?
        GROUP BY day ORDER BY day`,
    )
    .bind(since)
    .all();
  return { rows: result.results || [] };
}

export async function collectVisit(db, env, request, body) {
  const secret = request.headers.get("x-okavo-ingest") || "";
  if (!env.ANALYTICS_INGEST_SECRET || !timingSafeEqual(secret, env.ANALYTICS_INGEST_SECRET)) {
    throw new HttpError(401, "Unauthorized");
  }
  const visitor = clampText(body?.visitor_id, 80);
  const path = clampText(body?.path, 300);
  if (!visitor || !path) return { ok: true };
  const bucket = await sha256(`analytics:${visitor}`);
  const allowed = await consumeRateLimit(db, bucket, 120, 60);
  if (!allowed) return { ok: true };
  await db
    .prepare(
      `INSERT INTO site_visits (
         id, visitor_id, session_id, is_new_visitor, path, query, referrer_host, referrer_url, channel,
         utm_source, utm_medium, utm_campaign, utm_content, utm_term, country, region, city, timezone,
         device, os, browser, screen_width, language, profile_id, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      visitor,
      clampText(body.session_id, 80) || null,
      body.is_new_visitor ? 1 : 0,
      path,
      clampText(body.query, 500) || null,
      clampText(body.referrer_host, 200) || null,
      clampText(body.referrer_url, 500) || null,
      clampText(body.channel, 40) || null,
      clampText(body.utm_source, 80) || null,
      clampText(body.utm_medium, 80) || null,
      clampText(body.utm_campaign, 80) || null,
      clampText(body.utm_content, 80) || null,
      clampText(body.utm_term, 80) || null,
      clampText(body.country, 80) || null,
      clampText(body.region, 80) || null,
      clampText(body.city, 80) || null,
      clampText(body.timezone, 80) || null,
      clampText(body.device, 40) || null,
      clampText(body.os, 40) || null,
      clampText(body.browser, 40) || null,
      Number.isFinite(Number(body.screen_width)) ? Number(body.screen_width) : null,
      clampText(body.language, 12) || null,
      clampText(body.profile_id, 80) || null,
      nowIso(),
    )
    .run();
  return { ok: true };
}

export async function inviteBuilder(db, env, user, projectId, body) {
  requireUser(user);
  const project = await projectFor(db, projectId);
  if (project.buyer_id !== user.id && !isAdmin(user)) throw new HttpError(403, "Only the buyer can invite");
  const email = clampText(body?.email, 200).toLowerCase();
  if (!email.includes("@")) throw new HttpError(400, "Enter the builder's email");
  const token = crypto.randomUUID() + crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO project_invites (id, project_id, email, token_hash, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), projectId, email, await sha256(token), user.id, nowIso())
    .run();
  if (env.RESEND_API_KEY && env.MAIL_FROM) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [email],
        subject: "You are invited to an Okavo requirement",
        text: `A buyer invited you to countersign a locked Okavo requirement.\n\nOpen https://okavo.org/signin and accept invite token:\n${token}\n`,
      }),
    });
  }
  return { token };
}

export async function acceptInvite(db, user, body) {
  requireUser(user);
  const token = String(body?.token || "");
  const row = await db.prepare("SELECT * FROM project_invites WHERE token_hash = ?").bind(await sha256(token)).first();
  if (!row || row.accepted_at) throw new HttpError(400, "That invite is invalid or already used");
  if (user.email.toLowerCase() !== row.email) throw new HttpError(403, "Sign in with the invited email");
  await db.prepare("UPDATE project_invites SET accepted_by = ?, accepted_at = ? WHERE id = ?").bind(user.id, nowIso(), row.id).run();
  return { project_id: row.project_id };
}
