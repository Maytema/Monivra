// Whether the phone writes the time of day with 24 hours or with AM and PM: the person's own setting of the
// system (Settings → Date and time → 24-hour format), as the first application asked its Android shell.
import { getCalendars } from "expo-localization";

// True or false when the system answers, null when it does not (the language then decides).
export function systemHour24(): boolean | null {
  try {
    const answer = getCalendars()[0]?.uses24hourClock;
    return typeof answer === "boolean" ? answer : null;
  } catch {
    return null;
  }
}
