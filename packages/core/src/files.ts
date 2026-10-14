/** Matches the Worker private-file rules in cloudflare/worker/src/pure.js. */

export const FILE_MAX_BYTES = 5 * 1024 * 1024;

export const UPLOAD_PURPOSES = ["identity_document", "identity_selfie", "payment_proof"] as const;

export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

export type UploadMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export type UploadCheck =
  | { ok: true; mime: UploadMime; bytes: number }
  | { ok: false; message: string };

export function base64ByteLength(clean: string): number {
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

export function decodeBase64(clean: string): Uint8Array {
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function sniffMime(bytes: Uint8Array): UploadMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return "application/pdf";
  }
  return null;
}

export function normalizeUploadMime(mime: string): UploadMime | null {
  const value = String(mime || "").toLowerCase().split(";")[0]?.trim() ?? "";
  if (value === "image/jpg" || value === "image/pjpeg") return "image/jpeg";
  if (value === "image/jpeg" || value === "image/png" || value === "image/webp" || value === "application/pdf") {
    return value;
  }
  return null;
}

export function cleanBase64(value: string): string | null {
  const clean = String(value || "").replace(/\s/g, "");
  if (!clean || clean.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) return null;
  return clean;
}

/**
 * Client-side twin of the Worker upload check. The Worker still sniffs the
 * header and rejects mismatches; this stops an obvious bad file before upload.
 */
export function validateUpload(input: {
  declaredMime: string;
  dataBase64: string;
  purpose: UploadPurpose;
}): UploadCheck {
  const clean = cleanBase64(input.dataBase64);
  if (!clean) return { ok: false, message: "The file was not a valid upload." };
  const bytes = base64ByteLength(clean);
  if (!Number.isFinite(bytes) || bytes <= 0 || bytes > FILE_MAX_BYTES) {
    return { ok: false, message: "Files must be 5 MB or smaller." };
  }
  const declared = normalizeUploadMime(input.declaredMime);
  if (!declared) return { ok: false, message: "Upload a JPEG, PNG, WebP, or PDF." };
  if (input.purpose === "identity_selfie" && declared === "application/pdf") {
    return { ok: false, message: "The selfie must be a JPEG, PNG, or WebP photo." };
  }
  const sniffed = sniffMime(decodeBase64(clean.slice(0, 96)));
  if (sniffed !== declared) return { ok: false, message: "That file does not match the declared type." };
  return { ok: true, mime: declared, bytes };
}
