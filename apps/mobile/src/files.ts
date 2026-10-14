import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import { FILE_MAX_BYTES, validateUpload, type UploadPurpose } from "@okavo/core";
import { API_URL, session } from "./runtime";

export type PreparedFile = { mime: string; data: string };

const FILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function fromUri(uri: string, declaredMime: string, size: number | undefined, purpose: UploadPurpose): Promise<PreparedFile> {
  if (size && size > FILE_MAX_BYTES) throw new Error("Files must be 5 MB or smaller.");
  const data = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const check = validateUpload({ declaredMime, dataBase64: data, purpose });
  if (!check.ok) throw new Error(check.message);
  return { mime: check.mime, data };
}

export async function pickDocument(purpose: UploadPurpose): Promise<PreparedFile | null> {
  const types =
    purpose === "identity_selfie"
      ? ["image/jpeg", "image/png", "image/webp"]
      : ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  const picked = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true, multiple: false });
  if (picked.canceled || !picked.assets[0]) return null;
  const asset = picked.assets[0];
  return fromUri(asset.uri, asset.mimeType || "", asset.size, purpose);
}

export async function capturePhoto(purpose: UploadPurpose): Promise<PreparedFile | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error("Camera permission is off, so Okavo cannot take this photo.");
  const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
  if (shot.canceled || !shot.assets[0]) return null;
  const asset = shot.assets[0];
  return fromUri(asset.uri, asset.mimeType || "image/jpeg", asset.fileSize, purpose);
}

/** Downloads a private file with the bearer token in the header, never the URL. */
export async function openPrivateFile(fileId: string): Promise<void> {
  if (!FILE_ID.test(fileId) || fileId === "[purged]") {
    throw new Error("This file is not available.");
  }
  const token = await session.ensureAccess();
  if (!token) throw new Error("Sign in again.");
  const directory = FileSystem.cacheDirectory;
  if (!directory) throw new Error("This device has no private cache for the file.");
  const result = await FileSystem.downloadAsync(`${API_URL}/v1/files/${fileId}`, `${directory}${fileId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (result.status !== 200) throw new Error("This file could not be opened.");
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error("This device cannot hand the file to another app.");
  await Sharing.shareAsync(result.uri);
}
