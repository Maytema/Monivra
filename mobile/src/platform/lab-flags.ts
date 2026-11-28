// Speed-check lab only: the variant that is compared inside one build. The emulator script starts the application with
// `monivra:///?lab=far` (the flag is read from the start link before anything is drawn) and the variant is on for the whole run.
import { Linking } from "react-native";

export const lab = { far: false, warm: false };

export async function readLabFlags(): Promise<void> {
  try {
    const url = await Linking.getInitialURL();
    const found = url ? /[?&]lab=([a-z,]*)/.exec(url) : null;
    for (const name of (found?.[1] ?? "").split(",")) if (name in lab) (lab as Record<string, boolean>)[name] = true;
  } catch {
    // no start link: the flag stays off
  }
  console.log(`[perf] lab flags: ${Object.entries(lab).filter(([, on]) => on).map(([name]) => name).join(",") || "none"}`);
}
