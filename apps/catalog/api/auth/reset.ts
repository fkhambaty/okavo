import { assertCookieMutation, json, upstreamError, workerPost } from "./_shared";

export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  const invalid = assertCookieMutation(request);
  if (invalid) return invalid;

  let input: { email?: string; code?: string; password?: string };
  try {
    input = (await request.json()) as { email?: string; code?: string; password?: string };
  } catch {
    return json({ error: "Invalid request." }, { status: 400 });
  }
  if (!input.email || !input.code || !input.password) {
    return json({ error: "Email, code, and password are required." }, { status: 400 });
  }
  const { response, payload } = await workerPost("/v1/auth/reset", input, request);
  if (!response.ok) return upstreamError(response, payload);
  return json({ ok: true });
}
