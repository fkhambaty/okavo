import { HttpError, clampText, clientIp } from "./http.js";
import { bytesToHex, hashPassword, newCode, nowIso, sha256 } from "./pure.js";

const CODE_MINUTES = 15;
const MAX_CODE_ATTEMPTS = 5;
const RESEND_GAP_MS = 60 * 1000;
const ACCESS_MS = 15 * 60 * 1000;
const REFRESH_MS = 30 * 24 * 60 * 60 * 1000;

function adminEmails(env) {
  return new Set(
    String(env.ADMIN_EMAILS || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    email_confirmed_at: row.email_verified_at,
    confirmed_at: row.email_verified_at,
    user_metadata: {
      role: row.role === "admin" ? "buyer" : row.role,
      full_name: row.full_name,
      organization_name: row.organization_name || row.full_name,
      scale: row.scale || "local_business",
    },
  };
}

export function profilePayload(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    full_name: row.full_name,
    email_verified_at: row.email_verified_at,
    terms_version: row.terms_version,
    terms_accepted_at: row.terms_accepted_at,
    organization_name: row.organization_name ?? null,
    scale: row.scale ?? null,
    identity_status: row.identity_status ?? null,
    interview_status: row.interview_status ?? null,
    bidding_unlocked_at: row.bidding_unlocked_at ?? null,
    tier: row.tier ?? null,
  };
}

async function loadProfile(db, id) {
  return db
    .prepare(
      `SELECT p.*, b.organization_name, b.scale,
              d.identity_status, d.interview_status, d.bidding_unlocked_at, d.tier, d.headline
         FROM profiles p
         LEFT JOIN buyer_profiles b ON b.profile_id = p.id
         LEFT JOIN developer_profiles d ON d.profile_id = p.id
        WHERE p.id = ?`,
    )
    .bind(id)
    .first();
}

async function issueToken(db, userId, kind, ttl) {
  const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const expires = new Date(Date.now() + ttl).toISOString();
  await db
    .prepare(
      "INSERT INTO sessions (token_hash, user_id, kind, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(await sha256(token), userId, kind, expires, nowIso())
    .run();
  return { token, expires_in: Math.floor(ttl / 1000), expires_at: Math.floor(Date.parse(expires) / 1000) };
}

export async function issueSession(db, userId) {
  const access = await issueToken(db, userId, "access", ACCESS_MS);
  const refresh = await issueToken(db, userId, "refresh", REFRESH_MS);
  const profile = await loadProfile(db, userId);
  return {
    access_token: access.token,
    refresh_token: refresh.token,
    token_type: "bearer",
    expires_in: access.expires_in,
    expires_at: access.expires_at,
    user: publicUser(profile),
  };
}

export async function userFromRequest(request, db) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT p.*, b.organization_name, b.scale,
              d.identity_status, d.interview_status, d.bidding_unlocked_at, d.tier, d.headline
         FROM sessions s
         JOIN profiles p ON p.id = s.user_id
         LEFT JOIN buyer_profiles b ON b.profile_id = p.id
         LEFT JOIN developer_profiles d ON d.profile_id = p.id
        WHERE s.token_hash = ? AND s.kind = 'access' AND s.expires_at > ?`,
    )
    .bind(await sha256(token), nowIso())
    .first();
  return row ?? null;
}

function emailReady(env) {
  return Boolean(env.RESEND_API_KEY && env.MAIL_FROM);
}

async function sendEmail(env, to, subject, text) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const message = String(detail?.message || "")
      .replace(/[^\s@]+@[^\s@]+/g, "[email]")
      .slice(0, 180);
    console.error("resend_status", response.status, message);
  }
  return response.ok;
}

async function issueCode(db, env, email, purpose) {
  const recent = await db
    .prepare("SELECT created_at FROM email_codes WHERE email = ? AND purpose = ?")
    .bind(email, purpose)
    .first();
  if (recent && Date.now() - Date.parse(recent.created_at) < RESEND_GAP_MS) return true;
  const code = newCode();
  const now = nowIso();
  const expires = new Date(Date.now() + CODE_MINUTES * 60 * 1000).toISOString();
  await db
    .prepare(
      `INSERT INTO email_codes (email, purpose, code_hash, expires_at, attempts, created_at)
       VALUES (?, ?, ?, ?, 0, ?)
       ON CONFLICT(email, purpose) DO UPDATE SET
         code_hash = excluded.code_hash, expires_at = excluded.expires_at,
         attempts = 0, created_at = excluded.created_at`,
    )
    .bind(email, purpose, await sha256(`${email}:${purpose}:${code}`), expires, now)
    .run();
  const subject = purpose === "verify" ? "Your Okavo confirmation code" : "Your Okavo password reset code";
  const line =
    purpose === "verify"
      ? "Enter this code to confirm your email"
      : "Enter this code to choose a new password";
  const sent = await sendEmail(
    env,
    email,
    subject,
    `${line}: ${code}\n\nIt expires in ${CODE_MINUTES} minutes. If you did not ask for this, ignore this email.\n\nOkavo\nhttps://okavo.org`,
  );
  if (!sent) {
    await db.prepare("DELETE FROM email_codes WHERE email = ? AND purpose = ?").bind(email, purpose).run();
  }
  return sent;
}

async function checkCode(db, email, purpose, code) {
  const row = await db
    .prepare("SELECT * FROM email_codes WHERE email = ? AND purpose = ?")
    .bind(email, purpose)
    .first();
  if (!row) return false;
  if (row.attempts >= MAX_CODE_ATTEMPTS || Date.parse(row.expires_at) < Date.now()) {
    await db.prepare("DELETE FROM email_codes WHERE email = ? AND purpose = ?").bind(email, purpose).run();
    return false;
  }
  const matches = row.code_hash === (await sha256(`${email}:${purpose}:${String(code).trim()}`));
  if (!matches) {
    await db
      .prepare("UPDATE email_codes SET attempts = attempts + 1 WHERE email = ? AND purpose = ?")
      .bind(email, purpose)
      .run();
    return false;
  }
  await db.prepare("DELETE FROM email_codes WHERE email = ? AND purpose = ?").bind(email, purpose).run();
  return true;
}

export async function consumeRateLimit(db, bucket, limit, windowSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const row = await db.prepare("SELECT window_start, hits FROM rate_limits WHERE bucket = ?").bind(bucket).first();
  if (!row || now - Number(row.window_start) >= windowSeconds) {
    await db
      .prepare(
        `INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?, ?, 1)
         ON CONFLICT(bucket) DO UPDATE SET window_start = excluded.window_start, hits = 1`,
      )
      .bind(bucket, now)
      .run();
    return true;
  }
  if (Number(row.hits) >= limit) return false;
  await db.prepare("UPDATE rate_limits SET hits = hits + 1 WHERE bucket = ?").bind(bucket).run();
  return true;
}

async function throttle(db, request, scope, limit, windowSeconds) {
  const bucket = await sha256(`${scope}:${clientIp(request)}`);
  const allowed = await consumeRateLimit(db, bucket, limit, windowSeconds);
  if (!allowed) throw new HttpError(429, "Too many attempts. Please try again shortly.");
}

function desiredRole(value) {
  return value === "developer" ? "developer" : "buyer";
}

export async function signup(db, env, request, body) {
  await throttle(db, request, "signup", 10, 3600);
  const email = clampText(body?.email, 200).toLowerCase();
  const password = String(body?.password || "");
  const meta = body?.data && typeof body.data === "object" ? body.data : {};
  const fullName = clampText(meta.full_name || email, 120) || email;
  const organization = clampText(meta.organization_name || fullName, 160);
  const scale = clampText(meta.scale || "local_business", 40) || "local_business";
  const role = adminEmails(env).has(email) ? "admin" : desiredRole(meta.role);
  if (!email.includes("@") || password.length < 8) {
    throw new HttpError(400, "Use a valid email and a password of at least 8 characters.");
  }
  if (!emailReady(env)) {
    throw new HttpError(503, "Sign-up emails are not switched on yet. Please try again later.");
  }
  const existing = await db.prepare("SELECT id, email_verified_at FROM profiles WHERE email = ?").bind(email).first();
  if (existing?.email_verified_at) {
    throw new HttpError(409, "An account with that email already exists. Log in instead.");
  }
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const passwordHash = await hashPassword(password, salt);
  const now = nowIso();
  const id = existing?.id || crypto.randomUUID();
  if (existing) {
    await db
      .prepare(
        "UPDATE profiles SET password_hash = ?, password_salt = ?, full_name = ?, role = ?, updated_at = ? WHERE id = ?",
      )
      .bind(passwordHash, salt, fullName, role === "admin" ? "admin" : desiredRole(meta.role), now, id)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO profiles (id, email, password_hash, password_salt, role, full_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, email, passwordHash, salt, role, fullName, now, now)
      .run();
    if (role === "developer") {
      await db
        .prepare(
          `INSERT INTO developer_profiles (profile_id, headline, tier, created_at, updated_at)
           VALUES (?, '', 'applicant', ?, ?)`,
        )
        .bind(id, now, now)
        .run();
    } else {
      await db
        .prepare(
          `INSERT INTO buyer_profiles (profile_id, organization_name, scale, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(id, organization, scale, now, now)
        .run();
      if (role === "admin") {
        await db
          .prepare(
            `INSERT INTO developer_profiles (profile_id, headline, tier, created_at, updated_at)
             VALUES (?, '', 'applicant', ?, ?)`,
          )
          .bind(id, now, now)
          .run();
      }
    }
  }
  const sent = await issueCode(db, env, email, "verify");
  if (!sent) throw new HttpError(502, "We could not send the confirmation email. Try again in a minute.");
  return { needs_verification: true, email, user: { id, email } };
}

export async function verify(db, env, body) {
  const email = clampText(body?.email, 200).toLowerCase();
  const profile = await db.prepare("SELECT * FROM profiles WHERE email = ?").bind(email).first();
  if (!profile || !(await checkCode(db, email, "verify", body?.code || ""))) {
    throw new HttpError(400, "That code is wrong or has expired. Ask for a new one.");
  }
  const now = nowIso();
  await db.prepare("UPDATE profiles SET email_verified_at = ?, updated_at = ? WHERE id = ?").bind(now, now, profile.id).run();
  return issueSession(db, profile.id);
}

export async function resend(db, env, body) {
  const email = clampText(body?.email, 200).toLowerCase();
  const profile = await db.prepare("SELECT email_verified_at FROM profiles WHERE email = ?").bind(email).first();
  if (profile && !profile.email_verified_at && emailReady(env)) await issueCode(db, env, email, "verify");
  return { ok: true };
}

export async function login(db, env, request, body) {
  await throttle(db, request, "login", 20, 900);
  const email = clampText(body?.email, 200).toLowerCase();
  const password = String(body?.password || "");
  const profile = await db.prepare("SELECT * FROM profiles WHERE email = ?").bind(email).first();
  if (!profile?.password_hash || !profile.password_salt) {
    throw new HttpError(401, "Invalid email or password.");
  }
  const passwordHash = await hashPassword(password, profile.password_salt);
  if (passwordHash !== profile.password_hash) throw new HttpError(401, "Invalid email or password.");
  if (!profile.email_verified_at) {
    if (emailReady(env)) await issueCode(db, env, profile.email, "verify");
    throw new HttpError(403, "Confirm your email first. We sent you a code.");
  }
  return issueSession(db, profile.id);
}

export async function refresh(db, refreshToken) {
  if (!refreshToken) throw new HttpError(401, "Sign in again.");
  const row = await db
    .prepare("SELECT user_id FROM sessions WHERE token_hash = ? AND kind = 'refresh' AND expires_at > ?")
    .bind(await sha256(refreshToken), nowIso())
    .first();
  if (!row) throw new HttpError(401, "Sign in again.");
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(refreshToken)).run();
  return issueSession(db, row.user_id);
}

export async function logout(db, request, refreshToken) {
  const header = request.headers.get("authorization") || "";
  const access = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (access) await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(access)).run();
  if (refreshToken) {
    await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(refreshToken)).run();
  }
  return { ok: true };
}

export async function recovery(db, env, request, body) {
  await throttle(db, request, "recovery", 10, 3600);
  const email = clampText(body?.email, 200).toLowerCase();
  if (!emailReady(env)) {
    throw new HttpError(503, "Password reset emails are not switched on yet. Please try again later.");
  }
  const profile = await db.prepare("SELECT id, email_verified_at FROM profiles WHERE email = ?").bind(email).first();
  if (profile?.email_verified_at) await issueCode(db, env, email, "reset");
  return { ok: true };
}

export async function resetPassword(db, body) {
  const email = clampText(body?.email, 200).toLowerCase();
  const password = String(body?.password || "");
  if (password.length < 8) throw new HttpError(400, "Use a password of at least 8 characters.");
  const profile = await db.prepare("SELECT id FROM profiles WHERE email = ?").bind(email).first();
  if (!profile || !(await checkCode(db, email, "reset", body?.code || ""))) {
    throw new HttpError(400, "That code is wrong or has expired. Ask for a new one.");
  }
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const now = nowIso();
  await db
    .prepare(
      `UPDATE profiles
          SET password_hash = ?, password_salt = ?, email_verified_at = COALESCE(email_verified_at, ?), updated_at = ?
        WHERE id = ?`,
    )
    .bind(await hashPassword(password, salt), salt, now, now, profile.id)
    .run();
  await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(profile.id).run();
  return { ok: true };
}

export async function changePassword(db, user, body) {
  if (!user) throw new HttpError(401, "Log in again.");
  const password = String(body?.password || "");
  if (password.length < 8) throw new HttpError(400, "Use a password of at least 8 characters.");
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  await db
    .prepare("UPDATE profiles SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?")
    .bind(await hashPassword(password, salt), salt, nowIso(), user.id)
    .run();
  return { ok: true };
}

export async function me(db, user) {
  if (!user) throw new HttpError(401, "Log in again.");
  const profile = await loadProfile(db, user.id);
  return { profile: profilePayload(profile) };
}
