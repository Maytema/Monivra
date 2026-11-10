/* Where the PIN verifier lives in the Android shell. The hash of the PIN is kept encrypted with a key of
   the Android Keystore (a key that cannot be taken out of it, kept in hardware where the phone has
   it), not in the data of the application. The data then holds only that a PIN is set and how long it
   is, so a copy of the data (a file, a backup, the storage of the application) does not carry a
   hash to guess the PIN from.
   This protects the PIN, not the financial data: the data is not encrypted, and the lock screen only
   hides it. In a browser nothing here applies and the hash stays in the data. */
import { native } from "./native.js";

// The verifier read at the start, or null: none stored, or it could not be read.
let sealed = null;
let sealedState = "none"; // "ok", "missing" (nothing stored) or "error" (stored, but unreadable)

export async function loadSealedPin() {
  if (!native) return;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await native.secureGet({ key: "pin" });
      sealedState = r.status;
      sealed = r.status === "ok" ? JSON.parse(r.value) : null;
      if (r.status !== "error") return;
    } catch {
      sealedState = "error";
      sealed = null;
    }
  }
}
// A marker of the data said "the system holds the PIN" and the system did not have it: the lock was
// turned off instead of locking the person out of their own data. The start tells them once.
let dropped = false;
export const notePinDropped = () => {
  dropped = true;
};
export const takePinDropped = () => {
  const was = dropped;
  dropped = false;
  return was;
};
export const sealedPinRecord = () => sealed;
export const sealedPinState = () => sealedState;
export const canSealPin = () => Boolean(native);

// Stores the verifier in the Keystore-encrypted storage; rejects when that did not work, and then the
// caller keeps the hash where it was.
export async function sealPin(record) {
  await native.secureSet({ key: "pin", value: JSON.stringify(record) });
  sealed = record;
  sealedState = "ok";
}
export async function clearSealedPin() {
  if (!native) return;
  await native.secureRemove({ key: "pin" });
  sealed = null;
  sealedState = "missing";
}
