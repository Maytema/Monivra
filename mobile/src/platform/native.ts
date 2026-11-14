// The application's own native module (modules/monivra-native): the privacy screen, printing, report previews,
// photos, the PIN hash and touch signals. Absent
// (an older build, a test), every call says so instead of failing.
import { requireOptionalNativeModule } from "expo";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { MAX_PHOTO_BYTES, PHOTO_MIME_TYPES, PhotoError, toPhotoError } from "./photo-rules.ts";

interface MonivraNative {
  setSecure(on: boolean): boolean;
  printPdf(uri: string, name: string): boolean;
  takePhoto(): Promise<string | null>;
  photoDataUrl(uri: string, longSide: number, quality: number, maxBytes: number): string;
  pbkdf2?(password: string, saltHex: string, iterations: number): string;
  haptic?(kind: string): boolean;
  renderPdfPages?(uri: string, from: number, count: number, widthPx: number, id: string): Promise<string[]>;
  dropReportPreviews?(keep: string[]): boolean;
}
const native = requireOptionalNativeModule<MonivraNative>("MonivraNative");

let secure: boolean | null = null;
// Hides the application in the recent-apps preview and refuses screenshots while on ("Hide preview").
export function setSecureScreen(on: boolean): void {
  if (!native || secure === on) return;
  secure = on;
  native.setSecure(on);
}

// PBKDF2-HMAC-SHA256 by the system (hex of 32 bytes), or null where the module or the algorithm is missing.
export function nativePbkdf2(password: string, saltHex: string, iterations: number): string | null {
  try {
    return native?.pbkdf2?.(password, saltHex, iterations) ?? null;
  } catch {
    return null;
  }
}

// A touch signal through the module; false when it could not be given (the caller may fall back).
export function nativeHaptic(kind: string): boolean {
  try {
    return native?.haptic?.(kind) ?? false;
  } catch {
    return false;
  }
}

export const canPrint = (): boolean => !!native;

// Report previews as pictures drawn by the phone (application/report/page-images.ts). A preview has an id; its
// PDF is written to the cache as report-<id>.pdf and its pages go to the cache folder report-preview/<id>.
export const canRenderPdf = (): boolean => !!native?.renderPdfPages;

export const writeReportPdf = (id: string, bytes: Uint8Array): Promise<string> => cacheFile(`report-${id}.pdf`, bytes);

export function renderPdfPages(uri: string, from: number, count: number, widthPx: number, id: string): Promise<string[]> {
  if (!native?.renderPdfPages) return Promise.reject(new Error("The pages cannot be drawn here"));
  return native.renderPdfPages(uri, from, count, widthPx, id);
}

// Deletes the previews other than `keep` (ids).
export function dropReportPreviews(keep: string[]): void {
  try {
    native?.dropReportPreviews?.(keep);
  } catch {
    // Only the cache: nothing is lost if it stays.
  }
}

// Writes bytes to a file of the cache and gives its uri. Awaited: from SDK 58 a write finishes later (a promise),
// and a file handed on before that would be empty or cut short.
async function cacheFile(name: string, bytes: Uint8Array): Promise<string> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(bytes);
  return file.uri;
}

// Opens the system's print dialog for a PDF.
export async function printPdf(name: string, bytes: Uint8Array): Promise<boolean> {
  if (!native) return false;
  return native.printPdf(await cacheFile(name, bytes), name);
}

// Photos of operations: taken with the camera or chosen, shrunk to a small JPEG data URL (long side 800,
// quality 75, as js/platform/photo.js). Null when the person cancels. Only JPEG, PNG and WebP pictures up to
// MAX_PHOTO_MB are taken (photo-rules.ts); anything else is a PhotoError saying why.
export const canAttachPhotos = (): boolean => !!native;
const LONG_SIDE = 800;
const QUALITY = 75;

function shrink(uri: string): string {
  if (!native) throw new PhotoError("unreadable");
  try {
    return native.photoDataUrl(uri, LONG_SIDE, QUALITY, MAX_PHOTO_BYTES);
  } catch (error) {
    throw toPhotoError(error);
  }
}

export async function takePhoto(): Promise<string | null> {
  if (!native) return null;
  const uri = await native.takePhoto();
  return uri ? shrink(uri) : null;
}

export async function choosePhoto(): Promise<string | null> {
  if (!native) return null;
  const result = await DocumentPicker.getDocumentAsync({ type: PHOTO_MIME_TYPES, copyToCacheDirectory: true, multiple: false });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  if (!asset.size) throw new PhotoError("cloud");
  if (asset.size > MAX_PHOTO_BYTES) throw new PhotoError("size");
  return shrink(asset.uri);
}
