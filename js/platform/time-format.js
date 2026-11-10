/* Whether the person's device writes the time of day with 24 hours or with AM and PM. A browser tells
   it through the language only; the Android shell asks the system setting, which the person can change
   on their own (Settings → Date and time → 24-hour format). Until the answer comes, and in a browser,
   the language decides. */
import { native } from "./native.js";

let system24 = null;

// True or false once the system has answered, null before that (and in a browser).
export const systemHour24 = () => system24;

// Asks the Android shell; resolves true when the answer changed what is shown.
export async function refreshTimeFormat() {
  if (!native?.timeFormat) return false;
  try {
    const { is24 } = await native.timeFormat();
    const changed = system24 !== Boolean(is24);
    system24 = Boolean(is24);
    return changed;
  } catch {
    return false;
  }
}
