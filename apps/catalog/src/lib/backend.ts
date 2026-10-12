import { getAccessToken } from "./sessionClient";

export function apiBase(): string | undefined {
  const value = import.meta.env.VITE_OKAVO_API_URL as string | undefined;
  return value?.replace(/\/$/, "") || undefined;
}

export const isBackendConfigured = Boolean(apiBase());

export async function backend<T>(
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const base = apiBase();
  if (!base) throw new Error("Okavo API is not configured");
  const token = await getAccessToken();
  const response = await fetch(`${base}${path}`, {
    method: init?.method ?? (init?.body === undefined ? "GET" : "POST"),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }
  return payload as T;
}
