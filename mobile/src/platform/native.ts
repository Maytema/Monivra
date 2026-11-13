// The application's own native module (modules/monivra-native): the privacy screen and printing. Absent
// (an older build, a test), every call says so instead of failing.
import { requireOptionalNativeModule } from "expo";
import { File, Paths } from "expo-file-system";

interface MonivraNative {
  setSecure(on: boolean): boolean;
  printPdf(uri: string, name: string): boolean;
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
