/* Moves the PIN verifier between the data and the system storage of the Android shell (see
   platform/secure-pin.js). Called at the start, after a PIN is set or removed, and after data is
   restored from a file. Without the shell it does nothing, and the hash stays in the data. */
import { appData } from "../core/state.js";
import { save } from "../data/storage.js";
import { canSealPin, clearSealedPin, sealedPinRecord, sealPin } from "../platform/secure-pin.js";
import { pinMarker } from "../platform/pin.js";
import { render } from "./shell.js";

let working = false;
export function adoptNativePin() {
  if (!canSealPin() || working) return;
  const pin = appData.settings.pin;
  if (pin && typeof pin === "object" && !pin.native) {
    // A hash in the data (a PIN just set, or one that came from a browser backup): seal it, and only
    // when that worked take it out of the data. If sealing fails the hash stays, the lock still works.
    working = true;
    sealPin(pin)
      .then(() => {
        if (appData.settings.pin === pin) {
          appData.settings.pin = pinMarker(pin);
          save();
          render();
        }
      })
      .catch(() => {})
      .finally(() => {
        working = false;
        // Another PIN was set while this one was being sealed.
        const now = appData.settings.pin;
        if (now && typeof now === "object" && !now.native && now !== pin) adoptNativePin();
      });
  } else if (!pin && sealedPinRecord()) {
    // The PIN was turned off: its hash is not kept.
    clearSealedPin().catch(() => {});
  }
}
