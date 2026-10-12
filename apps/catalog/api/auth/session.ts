import {
  assertCookieMutation,
  clearRefreshCookie,
  json,
  refreshToken,
  sessionResponse,
  upstreamError,
  workerPost,
} from "./_shared";

export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  const invalid = assertCookieMutation(request);
  if (invalid) return invalid;

  const token = refreshToken(request);
  if (!token) {
    return json({ error: "Sign in again." }, { status: 401 });
  }
  const { response, payload } = await workerPost("/v1/auth/refresh", {
    refresh_token: token,
  });
  if (!response.ok) {
    const error = upstreamError(response, payload);
    error.headers.append("Set-Cookie", clearRefreshCookie(request));
    return error;
  }
  return sessionResponse(request, payload);
}
