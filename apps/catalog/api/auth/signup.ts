import { assertCookieMutation, json, upstreamError, workerPost } from "./_shared";

export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  const invalid = assertCookieMutation(request);
  if (invalid) return invalid;

  let input: { email?: string; password?: string; data?: Record<string, unknown> };
  try {
    input = (await request.json()) as {
      email?: string;
      password?: string;
      data?: Record<string, unknown>;
    };
  } catch {
    return json({ error: "Invalid request." }, { status: 400 });
  }
  if (!input.email || !input.password) {
    return json({ error: "Email and password are required." }, { status: 400 });
  }

  const { response, payload } = await workerPost(
    "/v1/auth/signup",
    { email: input.email, password: input.password, data: input.data ?? {} },
    request
  );
  if (!response.ok) return upstreamError(response, payload);
  return json({
    user: payload.user ?? null,
    session: null,
    needs_verification: true,
    email: payload.email,
  });
}
