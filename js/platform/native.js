/* The bridge to the Android shell. The application runs unchanged in a browser; inside the Android
   application the shell (Capacitor) puts `window.Capacitor` on the page and this module reaches the
   native parts through it. `native` is the plugin of this application (files, biometrics, secure
   storage, the internal copy of the data, system bars) and is null in a browser. */
const cap = globalThis.Capacitor;

// True inside the Android application.
export const isNative = Boolean(cap?.isNativePlatform?.());

const known = new Map();
// A plugin of the shell by name, or null in a browser.
export function plugin(name) {
  if (!isNative) return null;
  if (!known.has(name)) known.set(name, cap.Plugins?.[name] ?? cap.registerPlugin?.(name) ?? null);
  return known.get(name);
}

export const native = plugin("MonivraNative");

// The bytes of a file as base64 text, the form the native bridge carries.
export function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(blob);
  });
}
