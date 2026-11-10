/* The PIN of the screen lock. Only a salted hash of it is kept (never the digits), so a backup or an
   exported file does not show the PIN, and a PIN used elsewhere does not leak with it.
   This is a screen lock, not encryption: the financial data in the browser storage is not encrypted,
   and a PIN of 4 or 6 digits can be guessed from its hash by anyone who holds the file. The
   functions are synchronous so the lock screen needs no waiting. In the Android shell the hash is not
   kept in the data but in storage encrypted by the system keystore (see secure-pin.js); the data then
   holds a marker `{ v: 2, native: true, length }` and the check goes against that stored hash. */
import { notePinDropped, sealedPinRecord } from "./secure-pin.js";

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const rotr = (x, n) => (x >>> n) | (x << (32 - n));

// SHA-256 of bytes.
export function sha256(bytes) {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const length = bytes.length;
  const padded = new Uint8Array(((length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, length * 8, false);
  view.setUint32(padded.length - 8, Math.floor((length * 8) / 2 ** 32), false);
  const w = new Uint32Array(64);
  for (let block = 0; block < padded.length; block += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(block + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 =
        (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      [hh, g, f, e, d, c, b, a] = [g, f, e, (d + t1) | 0, c, b, a, (t1 + t2) | 0];
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += hh;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  h.forEach((x, i) => outView.setUint32(i * 4, x, false));
  return out;
}

function hmac(key, message) {
  const block = new Uint8Array(64);
  block.set(key.length > 64 ? sha256(key) : key);
  const inner = new Uint8Array(64 + message.length);
  const outer = new Uint8Array(96);
  for (let i = 0; i < 64; i++) {
    inner[i] = block[i] ^ 0x36;
    outer[i] = block[i] ^ 0x5c;
  }
  inner.set(message, 64);
  outer.set(sha256(inner), 64);
  return sha256(outer);
}

// PBKDF2-HMAC-SHA256 with one block of output (32 bytes).
export function pbkdf2(password, salt, iterations) {
  const first = new Uint8Array(salt.length + 4);
  first.set(salt);
  first[first.length - 1] = 1;
  let u = hmac(password, first);
  const result = Uint8Array.from(u);
  for (let i = 1; i < iterations; i++) {
    u = hmac(password, u);
    for (let j = 0; j < 32; j++) result[j] ^= u[j];
  }
  return result;
}

const ITERATIONS = 20000;
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (text) => Uint8Array.from(text.match(/../g) ?? [], (x) => parseInt(x, 16));
const text = (s) => new TextEncoder().encode(s);

// What is stored for a PIN: its length (the lock screen shows that many dots), a random salt and the
// hash. `salt` is for tests.
export function makePin(pin, salt = crypto.getRandomValues(new Uint8Array(16))) {
  return {
    v: 1,
    length: pin.length,
    salt: hex(salt),
    hash: hex(pbkdf2(text(pin), salt, ITERATIONS)),
  };
}
// Is a PIN set (a stored one, or a plain one of an earlier version that is about to be replaced)?
export const hasPin = (stored) => Boolean(stored);
// How many digits the stored PIN has.
export const pinLength = (stored) => (typeof stored === "string" ? stored.length : stored.length);
// What the data holds for a PIN whose hash is kept by the system.
export const pinMarker = (record) => ({ v: 2, native: true, length: record.length });
// Does the typed PIN match the stored one?
export function pinMatches(stored, typed) {
  if (!stored) return false;
  if (typeof stored === "string") return stored === typed;
  if (stored.native) {
    const record = sealedPinRecord();
    return record ? pinMatches(record, typed) : false;
  }
  const hash = pbkdf2(text(typed), unhex(stored.salt), ITERATIONS);
  // Compared in full whatever the first difference, as a habit of comparing secrets.
  let difference = 0;
  const wanted = unhex(stored.hash);
  for (let i = 0; i < 32; i++) difference |= hash[i] ^ (wanted[i] ?? 0);
  return difference === 0;
}
// A stored PIN in the current form: an earlier version kept the digits themselves.
// A marker for a hash kept by the system means nothing where there is no such hash (a data file opened
// on another device, a browser), so it becomes "no PIN" there.
export function protectedPin(stored) {
  if (typeof stored === "string") return /^\d{4,6}$/.test(stored) ? makePin(stored) : stored;
  if (stored?.native && !sealedPinRecord()) {
    notePinDropped();
    return false;
  }
  return stored;
}
