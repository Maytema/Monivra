/* PIN lock screen */
import { render } from "../../app/shell.js";
import { iconSvg } from "../../core/constants.js";
import { appData, pinEntry, setLocked, setPinEntry } from "../../core/state.js";
import { pinLength, pinMatches } from "../../platform/pin.js";
import { translate, translateWith } from "../../i18n/index.js";
import { biometricAvailable, verifyBiometric } from "../../platform/biometric.js";
import { buttonHtml, toast } from "../../ui/primitives.js";

// True right after a wrong PIN, until the next key: the dots shake.
let pinFailed = false;
// The row of dots on the lock screen: empty rings that fill up as digits are typed.
const pinDotsHtml = (size, typed, failed) =>
  `<div class="pin-dots ${failed ? "failed" : ""}" role="img" aria-label="${translateWith("{typed} of {size} digits", { typed, size })}">${Array.from(
    { length: size },
    (_, i) => `<span class="${i < typed ? "filled" : ""}"></span>`,
  ).join("")}</div>`;
// Wrong PINs in a row, and until when the lock screen refuses any PIN.
let wrongPins = 0;
let lockedUntil = 0;
// True while the last dot is still filling in; keys are ignored until the PIN is checked.
let pinBusy = false;
// Runs `fn` once the animations of the last dot are over, at once when there are none.
const afterLastDot = (fn) => {
  const running = document.querySelector(".pin-dots span:last-child")?.getAnimations?.() ?? [];
  if (!running.length) return fn();
  Promise.allSettled(running.map((a) => a.finished)).then(fn);
};
// The words of the system prompt, in the language of the application.
export const biometricTexts = () => ({
  title: translate("Unlock Monivra"),
  subtitle: translate("Confirm that it is you"),
  negative: translate("Use PIN"),
});
// Biometric unlock is wanted when it is on and the device can do it right now.
const wantsBiometric = () => Boolean(appData.settings.biometric) && biometricAvailable();
// The prompt is shown once for each time the screen locks, by itself; after that only the key
// below shows it, so cancelling it leaves the person on the PIN keys and not in a loop.
let promptedThisLock = false;
let prompting = false;
export async function promptBiometric() {
  if (prompting || !wantsBiometric()) return;
  prompting = true;
  try {
    const result = await verifyBiometric(biometricTexts());
    if (result === "ok") {
      wrongPins = 0;
      promptedThisLock = false;
      setLocked(false);
      setPinEntry("");
      render();
    } else if (result === "lockout") toast("Too many fingerprint attempts. Use your PIN.");
    else if (result === "failed") toast("Fingerprint or face could not be used. Use your PIN.");
  } finally {
    prompting = false;
  }
}
// PIN lock screen: the last dot fills in first, then the PIN is checked and the app opens.
export function lockView() {
  if (wantsBiometric() && !promptedThisLock) {
    promptedThisLock = true;
    setTimeout(promptBiometric, 0);
  }
  const size = pinLength(appData.settings.pin);
  const check = () => {
    pinBusy = false;
    if (Date.now() < lockedUntil) {
      pinFailed = true;
      toast(
        translateWith("Too many attempts. Try again in {n} s.", {
          n: Math.ceil((lockedUntil - Date.now()) / 1000),
        }),
      );
    } else if (pinMatches(appData.settings.pin, pinEntry)) {
      wrongPins = 0;
      promptedThisLock = false;
      setLocked(false);
    } else {
      pinFailed = true;
      // After five wrong PINs in a row the keys wait, longer each time; this only slows down
      // guessing on the screen, it does not protect the stored data.
      if (++wrongPins >= 5) lockedUntil = Date.now() + 30000 * 2 ** Math.min(wrongPins - 5, 4);
      toast(
        wrongPins >= 5
          ? translateWith("Too many attempts. Try again in {n} s.", {
              n: Math.ceil((lockedUntil - Date.now()) / 1000),
            })
          : "Incorrect PIN",
      );
    }
    setPinEntry("");
    render();
  };
  const press = (k) => {
    if (pinBusy) return;
    pinFailed = false;
    if (k === "⌫") setPinEntry(pinEntry.slice(0, -1));
    else if (pinEntry.length < size) setPinEntry(pinEntry + k);
    render();
    if (pinEntry.length === size) {
      pinBusy = true;
      afterLastDot(check);
    }
  };
  const digit = (k) => buttonHtml(k, () => press(k), "key");
  const backspace = buttonHtml(
    iconSvg("backspace", 30),
    () => press("⌫"),
    "key plain",
    `aria-label="${translate("Backspace")}"`,
  );
  const fingerprint = wantsBiometric()
    ? buttonHtml(
        iconSvg("fingerprint", 30),
        () => promptBiometric(),
        "key plain",
        `aria-label="${translate("Unlock with fingerprint or face")}"`,
      )
    : "<span></span>";
  const keys = [..."123456789"].map(digit).join("") + fingerprint + digit("0") + backspace;
  return `<div class="pin"><div>${iconSvg("lock", 42)}<h2>${translate("Enter your PIN")}</h2>${pinDotsHtml(size, pinEntry.length, pinFailed)}<div class="keypad">${keys}</div></div></div>`;
}
