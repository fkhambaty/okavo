/**
 * Native session against Worker /v1/auth.
 * The access token stays in memory. The refresh token is written to the
 * supplied store (SecureStore on device) and rotated with a single in-flight
 * request so two callers cannot burn the same refresh token.
 */

export type AccountUser = {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
};

export type WorkerSession = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  user: AccountUser;
};

export type SignupResult = {
  needs_verification: boolean;
  email: string;
  user: { id: string; email: string } | null;
};

export type RefreshStore = {
  read(): Promise<string | null>;
  write(token: string | null): Promise<void>;
};

export type AuthTransport = {
  login(email: string, password: string): Promise<WorkerSession>;
  signup(input: { email: string; password: string; data: Record<string, unknown> }): Promise<SignupResult>;
  verify(email: string, code: string): Promise<WorkerSession>;
  resend(email: string): Promise<{ ok: true }>;
  recovery(email: string): Promise<{ ok: true }>;
  reset(email: string, code: string, password: string): Promise<{ ok: true }>;
  refresh(refreshToken: string): Promise<WorkerSession>;
  logout(accessToken: string | null, refreshToken: string | null): Promise<void>;
};

export class SessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionError";
  }
}

function isSession(value: unknown): value is WorkerSession {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<WorkerSession>;
  return typeof row.access_token === "string" && typeof row.refresh_token === "string" && typeof row.expires_at === "number";
}

export class SessionController {
  private accessToken: string | null = null;
  private expiresAt = 0;
  private user: AccountUser | null = null;
  private flight: Promise<WorkerSession | null> | null = null;
  /** Held only until SecureStore accepts the rotated refresh token. */
  private unpersistedRefresh: string | null = null;

  constructor(
    private readonly store: RefreshStore,
    private readonly transport: AuthTransport,
  ) {}

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getUser(): AccountUser | null {
    return this.user;
  }

  private apply(session: WorkerSession): void {
    this.accessToken = session.access_token;
    this.expiresAt = session.expires_at;
    this.user = session.user;
  }

  private clearMemory(): void {
    this.accessToken = null;
    this.expiresAt = 0;
    this.user = null;
  }

  private async persistRefresh(token: string): Promise<void> {
    this.unpersistedRefresh = token;
    try {
      await this.store.write(token);
    } catch {
      throw new SessionError("Could not store the refresh token on this device.");
    }
    if (this.unpersistedRefresh === token) this.unpersistedRefresh = null;
  }

  private async readRefresh(): Promise<string | null> {
    if (this.unpersistedRefresh) return this.unpersistedRefresh;
    return this.store.read();
  }

  private async adopt(session: WorkerSession): Promise<WorkerSession> {
    if (!isSession(session)) throw new SessionError("The server did not return a session.");
    if (session.access_token === session.refresh_token) {
      throw new SessionError("Refusing a session that reuses one token for access and refresh.");
    }
    try {
      await this.persistRefresh(session.refresh_token);
    } catch (error) {
      this.apply(session);
      throw error;
    }
    this.apply(session);
    return session;
  }

  async login(email: string, password: string): Promise<WorkerSession> {
    return this.adopt(await this.transport.login(email, password));
  }

  async verify(email: string, code: string): Promise<WorkerSession> {
    return this.adopt(await this.transport.verify(email, code));
  }

  signup(input: { email: string; password: string; data: Record<string, unknown> }): Promise<SignupResult> {
    return this.transport.signup(input);
  }

  resend(email: string): Promise<{ ok: true }> {
    return this.transport.resend(email);
  }

  recovery(email: string): Promise<{ ok: true }> {
    return this.transport.recovery(email);
  }

  reset(email: string, code: string, password: string): Promise<{ ok: true }> {
    return this.transport.reset(email, code, password);
  }

  /**
   * One network refresh at a time. The new refresh token is stored before the
   * access token is published. Concurrent callers share that result.
   */
  refresh(): Promise<WorkerSession | null> {
    if (this.flight) return this.flight;
    this.flight = this.rotate().finally(() => {
      this.flight = null;
    });
    return this.flight;
  }

  private async rotate(): Promise<WorkerSession | null> {
    const current = await this.readRefresh();
    if (!current) {
      this.clearMemory();
      return null;
    }
    try {
      const session = await this.transport.refresh(current);
      return await this.adopt(session);
    } catch (error) {
      if (error instanceof SessionError && error.message.startsWith("Could not store")) {
        throw error;
      }
      await this.store.write(null).catch(() => undefined);
      this.unpersistedRefresh = null;
      this.clearMemory();
      return null;
    }
  }

  async ensureAccess(): Promise<string | null> {
    const fresh = this.expiresAt > Math.floor(Date.now() / 1000) + 60;
    if (this.accessToken && fresh) return this.accessToken;
    const session = await this.refresh();
    return session?.access_token ?? null;
  }

  async restore(): Promise<WorkerSession | null> {
    return this.refresh();
  }

  async logout(): Promise<void> {
    const access = this.accessToken;
    const refreshToken = await this.readRefresh();
    try {
      await this.transport.logout(access, refreshToken);
    } catch {
      // Local sign-out still clears the device copy if the network fails.
    } finally {
      this.unpersistedRefresh = null;
      this.clearMemory();
      await this.store.write(null).catch(() => undefined);
    }
  }
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

async function readError(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => ({}))) as { error?: unknown };
  return typeof payload.error === "string" && payload.error ? payload.error : "Request failed.";
}

export function createWorkerAuthTransport(baseUrl: string, fetchImpl: FetchLike = fetch): AuthTransport {
  const root = baseUrl.replace(/\/$/, "");

  async function post<T>(path: string, body: unknown, accessToken?: string | null): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;
    const response = await fetchImpl(`${root}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body ?? {}),
    });
    if (!response.ok) throw new ApiError(response.status, await readError(response));
    return (await response.json()) as T;
  }

  return {
    login: (email, password) => post<WorkerSession>("/v1/auth/login", { email, password }),
    signup: (input) => post<SignupResult>("/v1/auth/signup", input),
    verify: (email, code) => post<WorkerSession>("/v1/auth/verify", { email, code }),
    resend: (email) => post<{ ok: true }>("/v1/auth/resend", { email }),
    recovery: (email) => post<{ ok: true }>("/v1/auth/recovery", { email }),
    reset: (email, code, password) => post<{ ok: true }>("/v1/auth/reset", { email, code, password }),
    refresh: (refreshToken) => post<WorkerSession>("/v1/auth/refresh", { refresh_token: refreshToken }),
    logout: (accessToken, refreshToken) =>
      post<{ ok: true }>("/v1/auth/logout", { refresh_token: refreshToken }, accessToken).then(() => undefined),
  };
}

export type ApiCaller = {
  request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>;
};

const TOKEN_IN_URL = /(?:access_token|refresh_token)=/i;

export function createApiClient(options: {
  baseUrl: string;
  ensureAccess: () => Promise<string | null>;
  forceRefresh?: () => Promise<string | null>;
  fetchImpl?: FetchLike;
}): ApiCaller {
  const root = options.baseUrl.replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  async function once(path: string, init: { method?: string; body?: unknown } | undefined, token: string | null, retry: boolean): Promise<Response> {
    if (TOKEN_IN_URL.test(path)) throw new ApiError(400, "Tokens are not sent in URLs.");
    const headers: Record<string, string> = { accept: "application/json" };
    if (init?.body !== undefined) headers["content-type"] = "application/json";
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetchImpl(`${root}${path}`, {
      method: init?.method ?? (init?.body === undefined ? "GET" : "POST"),
      headers,
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (response.status === 401 && retry) {
      const next = await (options.forceRefresh ?? options.ensureAccess)();
      if (next && next !== token) return once(path, init, next, false);
    }
    return response;
  }

  return {
    async request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
      const token = await options.ensureAccess();
      const response = await once(path, init, token, true);
      if (!response.ok) throw new ApiError(response.status, await readError(response));
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    },
  };
}
