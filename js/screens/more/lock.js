/* PIN lock screen */
import { render } from "../../app/shell.js";
import { iconSvg } from "../../core/constants.js";
import { appData, pinEntry, setLocked, setPinEntry } from "../../core/state.js";
import { translate, translateWith } from "../../i18n/index.js";
import { buttonHtml, toast } from "../../ui/primitives.js";

// True right after a wrong PIN, until the next key: the dots shake.
let pinFailed = false;
// The row of dots on the lock screen: empty rings that fill up as digits are typed.
const pinDotsHtml = (size, typed, failed) =>
  `<div class="pin-dots ${failed ? "failed" : ""}" role="img" aria-label="${translateWith("{typed} of {size} digits", { typed, size })}">${Array.from(
    { length: size },
    (_, i) => `<span class="${i < typed ? "filled" : ""}"></span>`,
  ).join("")}</div>`;
// True while the last dot is still filling in; keys are ignored until the PIN is checked.
let pinBusy = false;
// Runs `fn` once the animations of the last dot are over, at once when there are none.
const afterLastDot = (fn) => {
  const running = document.querySelector(".pin-dots span:last-child")?.getAnimations?.() ?? [];
  if (!running.length) return fn();
  Promise.allSettled(running.map((a) => a.finished)).then(fn);
};
// PIN lock screen: the last dot fills in first, then the PIN is checked and the app opens.
export function lockView() {
  const size = appData.settings.pin.length;
  const check = () => {
    pinBusy = false;
    if (pinEntry === appData.settings.pin) setLocked(false);
    else {
      pinFailed = true;
      toast("Incorrect PIN");
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
  const keys = [..."123456789"].map(digit).join("") + "<span></span>" + digit("0") + backspace;
  return `<div class="pin"><div>${iconSvg("lock", 42)}<h2>${translate("Enter your PIN")}</h2>${pinDotsHtml(size, pinEntry.length, pinFailed)}<div class="keypad">${keys}</div></div></div>`;
}
