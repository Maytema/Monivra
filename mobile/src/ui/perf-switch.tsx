// Speed-check build: small touch boxes at the top left. The first moves to the next setting of perfFlags (see perf.ts), the second starts
// and stops the Hermes sampling profiler (the trace is written to the log). Nothing in other builds.
import { Fragment } from "react";
import { Pressable } from "./pressable.tsx";
import { nextPerfSetting, PERF_BUILD, toggleProfile } from "../platform/perf.ts";

export function PerfSwitch() {
  if (!PERF_BUILD) return null;
  return (
    <Fragment>
      <Pressable accessibilityLabel="perf setting" onPress={() => void nextPerfSetting()} style={{ position: "absolute", left: 0, top: 120, width: 14, height: 14 }} />
      <Pressable accessibilityLabel="perf profile" onPress={() => void toggleProfile()} style={{ position: "absolute", left: 0, top: 180, width: 14, height: 14 }} />
    </Fragment>
  );
}
