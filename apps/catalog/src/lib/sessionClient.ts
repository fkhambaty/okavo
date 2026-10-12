export type AccountUser = {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
};

export type Session = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  user: AccountUser;
};

type PublicSession = {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  user: AccountUser;
};

type SessionListener = (session: Session | null) => void;

let currentSession: Session | null = null;
let refreshPromise: Promise<Session | null> | null = null;
let sessionChecked = false;
const listeners = new Set<SessionListener>();

function asSession(session: PublicSession): Session {
  return {
    access_token: session.access_token,
    refresh_token: "",
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    user: session.user,
  };
}

function publish(session: Session | null): Session | null {
  sessionChecked = true;
  currentSession = session;
  for (const listener of listeners) listener(session);
  return session;
}

async function request<T>(
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "x-okavo-csrf": "1",
    },
    body: JSON.stringify(body ?? {}),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? "Authentication request failed.");
  }
  return payload as T;
}

export function getMemorySession(): Session | null {
  return currentSession;
}

export function onMemorySessionChange(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function refreshMemorySession(): Promise<Session | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = request<{ session: PublicSession | null }>("/api/auth/session")
    .then(({ session }) => publish(session ? asSession(session) : null))
    .catch(() => publish(null))
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

export async function getAccessToken(): Promise<string | null> {
  const expiresAt = currentSession?.expires_at ?? 0;
  if (
    !sessionChecked ||
    (currentSession && expiresAt <= Math.floor(Date.now() / 1000) + 60)
  ) {
    await refreshMemorySession();
  }
  return currentSession?.access_token ?? null;
}

export async function resendSignupVerification(email: string): Promise<void> {
  await request("/api/auth/resend", { email });
}

export async function verifySignupCode(email: string, code: string): Promise<Session> {
  const { session } = await request<{ session: PublicSession }>("/api/auth/verify", {
    email,
    code,
  });
  return publish(asSession(session)) as Session;
}

export async function resetPasswordWithCode(
  email: string,
  code: string,
  password: string
): Promise<void> {
  await request("/api/auth/reset", { email, code, password });
}

export async function updateAccountPassword(password: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("Sign in again before changing your password.");
  }
  const base = import.meta.env.VITE_OKAVO_API_URL as string | undefined;
  if (!base) throw new Error("Authentication is not configured.");
  const response = await fetch(`${base.replace(/\/$/, "")}/v1/auth/password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ password }),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Could not update your password.");
}

export async function receptionistSignIn(
  email: string,
  password: string
): Promise<Session> {
  const { session } = await request<{ session: PublicSession }>(
    "/api/auth/login",
    { email, password }
  );
  return publish(asSession(session)) as Session;
}

export async function receptionistSignUp(input: {
  email: string;
  password: string;
  data: Record<string, unknown>;
}): Promise<{ user: AccountUser | null; session: Session | null; needsVerification: boolean }> {
  const result = await request<{
    user: AccountUser | null;
    session: PublicSession | null;
    needs_verification?: boolean;
  }>("/api/auth/signup", input);
  const session = result.session ? asSession(result.session) : null;
  publish(session);
  return {
    user: result.user,
    session,
    needsVerification: Boolean(result.needs_verification),
  };
}

export async function receptionistSignOut(): Promise<void> {
  try {
    await request<{ ok: true }>("/api/auth/logout");
  } catch {
    // Local sign-out must still succeed if the network is unavailable.
  } finally {
    publish(null);
  }
}

export async function requestPasswordRecovery(email: string): Promise<void> {
  await request<{ ok: true }>("/api/auth/recovery", { email });
}
