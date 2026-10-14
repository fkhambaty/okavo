import assert from "node:assert/strict";
import test from "node:test";
import { SessionController, createApiClient, createWorkerAuthTransport } from "../dist/session.js";

function memoryStore() {
  let value = null;
  const writes = [];
  return {
    writes,
    async read() {
      return value;
    },
    async write(token) {
      writes.push(token);
      value = token;
    },
  };
}

function session(n) {
  return {
    access_token: `access-${n}`,
    refresh_token: `refresh-${n}`,
    token_type: "bearer",
    expires_in: 900,
    expires_at: Math.floor(Date.now() / 1000) + 900,
    user: { id: "user-1", email: "a@okavo.org" },
  };
}

test("refresh rotates once for concurrent callers and stores only the refresh token", async () => {
  const store = memoryStore();
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const transport = {
    login: async () => session(1),
    signup: async () => ({ needs_verification: true, email: "a@okavo.org", user: null }),
    verify: async () => session(1),
    resend: async () => ({ ok: true }),
    recovery: async () => ({ ok: true }),
    reset: async () => ({ ok: true }),
    refresh: async (token) => {
      calls += 1;
      assert.equal(token, "refresh-1");
      await gate;
      return session(2);
    },
    logout: async () => undefined,
  };
  const controller = new SessionController(store, transport);
  await controller.login("a@okavo.org", "password");
  controller.getAccessToken();
  const first = controller.refresh();
  const second = controller.refresh();
  release();
  const [left, right] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(left.refresh_token, "refresh-2");
  assert.equal(right.access_token, "access-2");
  assert.deepEqual(store.writes, ["refresh-1", "refresh-2"]);
  assert.equal(store.writes.includes("access-1"), false);
  assert.equal(store.writes.includes("access-2"), false);
});

test("logout revokes both tokens and clears the store even when the network fails", async () => {
  const store = memoryStore();
  const seen = [];
  const transport = {
    login: async () => session(1),
    signup: async () => ({ needs_verification: true, email: "a@okavo.org", user: null }),
    verify: async () => session(1),
    resend: async () => ({ ok: true }),
    recovery: async () => ({ ok: true }),
    reset: async () => ({ ok: true }),
    refresh: async () => session(2),
    logout: async (access, refresh) => {
      seen.push({ access, refresh });
      throw new Error("offline");
    },
  };
  const controller = new SessionController(store, transport);
  await controller.login("a@okavo.org", "password");
  await controller.logout();
  assert.deepEqual(seen, [{ access: "access-1", refresh: "refresh-1" }]);
  assert.equal(await store.read(), null);
  assert.equal(controller.getAccessToken(), null);
});

test("auth transport posts the refresh token in the body, never the query string", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: init.body, authorization: init.headers.authorization });
    return new Response(JSON.stringify(session(3)), { status: 200, headers: { "content-type": "application/json" } });
  };
  const transport = createWorkerAuthTransport("https://okavo-api.fkhambaty.workers.dev", fetchImpl);
  await transport.refresh("refresh-secret");
  assert.equal(calls[0].url, "https://okavo-api.fkhambaty.workers.dev/v1/auth/refresh");
  assert.equal(calls[0].url.includes("refresh-secret"), false);
  assert.deepEqual(JSON.parse(calls[0].body), { refresh_token: "refresh-secret" });
});

test("api client retries once after 401 and refuses tokens in the path", async () => {
  let access = "stale";
  const urls = [];
  const fetchImpl = async (url, init) => {
    urls.push(url);
    const header = init.headers.authorization || "";
    if (header.endsWith("stale")) return new Response(JSON.stringify({ error: "Sign in again." }), { status: 401 });
    return new Response(JSON.stringify({ projects: [] }), { status: 200 });
  };
  const client = createApiClient({
    baseUrl: "https://okavo-api.fkhambaty.workers.dev",
    ensureAccess: async () => access,
    forceRefresh: async () => {
      access = "fresh";
      return access;
    },
    fetchImpl,
  });
  const body = await client.request("/v1/projects");
  assert.deepEqual(body, { projects: [] });
  assert.equal(urls.length, 2);
  await assert.rejects(() => client.request("/v1/files/1?access_token=nope"), /Tokens are not sent/);
});
