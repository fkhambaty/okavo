import {
  assertCookieMutation,
  json,
  sessionResponse,
  upstreamError,
  workerPost,
} from "./_shared";

export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  const invalid = assertCookieMutation(request);
  if (invalid) return invalid;

  let input: { email?: string; code?: string };
  try {
    input = (await request.json()) as { email?: string; code?: string };
  } catch {
    return json({ error: "Invalid request." }, { status: 400 });
  }
  if (!input.email || !input.code) {
    return json({ error: "Email and code are required." }, { status: 400 });
  }
  const { response, payload } = await workerPost(
    "/v1/auth/verify",
    { email: input.email, code: input.code },
    request
  );
  if (!response.ok) return upstreamError(response, payload);
  return sessionResponse(request, payload);
}
