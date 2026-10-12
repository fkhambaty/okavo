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
    // A missing session is the normal state for a public page. A 401 here
    // shows up as a browser console error on every marketing visit.
    return json({ session: null });
  }
  const { response, payload } = await workerPost("/v1/auth/refresh", {
    refresh_token: token,
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return json(
        { session: null },
        { headers: { "Set-Cookie": clearRefreshCookie(request) } },
      );
    }
    const error = upstreamError(response, payload);
    error.headers.append("Set-Cookie", clearRefreshCookie(request));
    return error;
  }
  return sessionResponse(request, payload);
}
