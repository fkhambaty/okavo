import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import {
  ApiError,
  DEFAULT_API_URL,
  SessionController,
  createApiClient,
  createWorkerAuthTransport,
  type Profile,
} from "@okavo/core";

const REFRESH_KEY = "okavo.refresh.v1";

export const API_URL = (process.env.EXPO_PUBLIC_OKAVO_API_URL || DEFAULT_API_URL).replace(/\/$/, "");

export const refreshStore = {
  async read(): Promise<string | null> {
    if (Platform.OS === "web") return null;
    return SecureStore.getItemAsync(REFRESH_KEY);
  },
  async write(token: string | null): Promise<void> {
    if (Platform.OS === "web") {
      throw new Error("Okavo keeps the refresh token in the device keychain. Use the iOS or Android app.");
    }
    if (token === null) {
      await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => undefined);
      return;
    }
    await SecureStore.setItemAsync(REFRESH_KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
};

export const session = new SessionController(refreshStore, createWorkerAuthTransport(API_URL));

export const api = createApiClient({
  baseUrl: API_URL,
  ensureAccess: () => session.ensureAccess(),
  forceRefresh: async () => (await session.refresh())?.access_token ?? null,
});

export function messageFrom(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return "Request failed.";
}

export async function loadProfile(): Promise<Profile> {
  const body = await api.request<{ profile: Profile }>("/v1/me");
  return body.profile;
}
