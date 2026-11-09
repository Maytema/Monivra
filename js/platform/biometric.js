/* Biometric unlock: not available in the browser version, on purpose. A fingerprint or face check
   that unlocks a local screen needs the system keystore and the system prompt of a native
   application; in a browser the only route (WebAuthn) proves a person to a server and cannot guard a
   local screen, and a confirmation dialog pretending to be a fingerprint would be a lie. The PIN is
   the unlock. A native shell implements these two functions with the system biometric prompt, and
   the lock screen then offers it next to the PIN keys. */

// Is biometric unlock available on this device? Always false in the browser.
export const biometricAvailable = () => false;

// Asks the system to check the person; resolves true when it did. Never resolves true in the browser.
export async function verifyBiometric() {
  throw Error("Biometric unlock is not available in this version.");
}
