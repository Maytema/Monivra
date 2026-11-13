// The keystore and the biometric prompt of the phone, for the screen lock.
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { bytesOfHex, derivePinInJs, hexOf, makePin, pinMatches, PIN_ITERATIONS, type DerivePin, type PinRecord } from "../domain/pin.ts";
import { nativePbkdf2 } from "./native.ts";

const KEY = "monivra.pin";

// The record is read from the keystore once and kept while the application runs, so a typed PIN is checked
// without waiting for the keystore again.
let known: { record: PinRecord | null } | null = null;

export async function readPinRecord(): Promise<PinRecord | null> {
  if (known) return known.record;
  try {
    const text = await SecureStore.getItemAsync(KEY);
    known = { record: text ? (JSON.parse(text) as PinRecord) : null };
    return known.record;
  } catch {
    return null;
  }
}

export async function writePinRecord(record: PinRecord | null): Promise<void> {
  known = null;
  if (record) await SecureStore.setItemAsync(KEY, JSON.stringify(record));
  else await SecureStore.deleteItemAsync(KEY);
  known = { record };
}

// The hash by the system's own PBKDF2 when it is there and gives the published test vector (checked once);
// by the JavaScript one otherwise. Both give the same bytes, so a PIN set with one is accepted by the other.
let nativeWorks: boolean | null = null;
const derive: DerivePin = (pin, salt, iterations) => {
  if (nativeWorks === null) nativeWorks = nativePbkdf2("password", "73616c74", 2) === "ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43";
  const fast = nativeWorks ? nativePbkdf2(pin, hexOf(salt), iterations) : null;
  return fast ? bytesOfHex(fast) : derivePinInJs(pin, salt, iterations);
};

// Is this the PIN of the lock?
export async function checkPin(typed: string): Promise<boolean> {
  return pinMatches(await readPinRecord(), typed, derive);
}

// Sets the PIN of the lock (only its salted hash is kept).
export function storePin(pin: string): Promise<void> {
  return writePinRecord(makePin(pin, randomSalt(), PIN_ITERATIONS, derive));
}

export const removePin = (): Promise<void> => writePinRecord(null);

export async function biometricAvailable(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

// "ok", "cancelled" (the person chose the PIN, or the screen went away), "lockout" (too many wrong attempts,
// the system blocks the sensor for a while) or "failed" (the sensor could not be used).
export type BiometricResult = "ok" | "cancelled" | "lockout" | "failed";
export async function biometricUnlock(prompt: string, cancel: string): Promise<BiometricResult> {
  try {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, cancelLabel: cancel, disableDeviceFallback: true });
    if (result.success) return "ok";
    if (result.error === "lockout") return "lockout";
    return ["user_cancel", "system_cancel", "app_cancel", "user_fallback"].includes(result.error) ? "cancelled" : "failed";
  } catch {
    return "failed";
  }
}

export function randomSalt(): Uint8Array {
  const salt = new Uint8Array(16);
  globalThis.crypto.getRandomValues(salt);
  return salt;
}
