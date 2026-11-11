// Identifiers. New records get a UUID version 7 (time-ordered, random); the random bytes come from
// the platform (Web Crypto in Node and, through expo-crypto, on the phone).
const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export function uuidv7(now = Date.now(), random?: Uint8Array<ArrayBuffer>): string {
  const bytes = random ?? new Uint8Array(16);
  if (!random) globalThis.crypto.getRandomValues(bytes);
  let t = now;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = t % 256;
    t = Math.floor(t / 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const h = hex(bytes);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
