import {
  assertCookieMutation,
  clearRefreshCookie,
  json,
  refreshToken,
  workerPost,
} from "./_shared";

export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  const invalid = assertCookieMutation(request);
  if (invalid) return invalid;

  const token = refreshToken(request);
  if (token) {
    await workerPost("/v1/auth/logout", { refresh_token: token }).catch(() => null);
  }
  return json({ ok: true }, { headers: { "Set-Cookie": clearRefreshCookie(request) } });
}
