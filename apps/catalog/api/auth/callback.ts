export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "https://okavo.org";
  return Response.redirect(`${origin}/signin`, 303);
}
