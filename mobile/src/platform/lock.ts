// The keystore and the biometric prompt of the phone, for the screen lock.
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import type { PinRecord } from "../domain/pin.ts";

const KEY = "monivra.pin";

export async function readPinRecord(): Promise<PinRecord | null> {
  try {
    const text = await SecureStore.getItemAsync(KEY);
    return text ? (JSON.parse(text) as PinRecord) : null;
  } catch {
    return null;
  }
}

export async function writePinRecord(record: PinRecord | null): Promise<void> {
  if (record) await SecureStore.setItemAsync(KEY, JSON.stringify(record));
  else await SecureStore.deleteItemAsync(KEY);
}

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
