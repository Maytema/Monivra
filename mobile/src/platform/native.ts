// The application's own native module (modules/monivra-native): the privacy screen and printing. Absent
// (an older build, a test), every call says so instead of failing.
import { requireOptionalNativeModule } from "expo";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";

interface MonivraNative {
  setSecure(on: boolean): boolean;
  printPdf(uri: string, name: string): boolean;
  takePhoto(): Promise<string | null>;
  photoDataUrl(uri: string, longSide: number, quality: number): string;
}
const native = requireOptionalNativeModule<MonivraNative>("MonivraNative");

let secure: boolean | null = null;
// Hides the application in the recent-apps preview and refuses screenshots while on ("Hide preview").
export function setSecureScreen(on: boolean): void {
  if (!native || secure === on) return;
  secure = on;
  native.setSecure(on);
}

export const canPrint = (): boolean => !!native;

// Opens the system's print dialog for a PDF.
export function printPdf(name: string, bytes: Uint8Array): boolean {
  if (!native) return false;
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  return native.printPdf(file.uri, name);
}

// Photos of operations: taken with the camera or chosen, shrunk to a small JPEG data URL (long side 800,
// quality 75, as js/platform/photo.js). Null when the person cancels.
export const canAttachPhotos = (): boolean => !!native;
const LONG_SIDE = 800;
const QUALITY = 75;

export async function takePhoto(): Promise<string | null> {
  if (!native) return null;
  const uri = await native.takePhoto();
  return uri ? native.photoDataUrl(uri, LONG_SIDE, QUALITY) : null;
}

export async function choosePhoto(): Promise<string | null> {
  if (!native) return null;
  const result = await DocumentPicker.getDocumentAsync({ type: "image/*", copyToCacheDirectory: true, multiple: false });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  if (!asset.size) throw new Error("The photo is not fully on the phone. Download it first");
  return native.photoDataUrl(asset.uri, LONG_SIDE, QUALITY);
}
