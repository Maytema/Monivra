// Speed-check build: a small touch box at the top left that moves to the next setting of perfFlags (see perf.ts). Nothing in other builds.
import { Pressable } from "react-native";
import { nextPerfSetting, PERF_BUILD } from "./perf.ts";

export function PerfSwitch() {
  if (!PERF_BUILD) return null;
  return <Pressable accessibilityLabel="perf setting" onPress={() => void nextPerfSetting()} style={{ position: "absolute", left: 0, top: 120, width: 14, height: 14 }} />;
}
