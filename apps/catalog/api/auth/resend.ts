import { assertCookieMutation, json, upstreamError, workerPost } from "./_shared";

export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  const invalid = assertCookieMutation(request);
  if (invalid) return invalid;
  let email: string | undefined;
  try {
    email = ((await request.json()) as { email?: string }).email;
  } catch {
    return json({ error: "Invalid request." }, { status: 400 });
  }
  if (!email) return json({ error: "Email is required." }, { status: 400 });
  const { response, payload } = await workerPost("/v1/auth/resend", { email }, request);
  if (!response.ok) return upstreamError(response, payload);
  return json({ ok: true });
}
