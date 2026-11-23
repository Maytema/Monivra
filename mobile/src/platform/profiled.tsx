// Speed-check build: the time React spends drawing a part (React.Profiler), written as "[perf] profile <id> <phase> <ms>".
// `actual` includes the children, so ids nest (the page holds its rows, a row its icons). Nothing in other builds.
import { Profiler, type ReactNode } from "react";
import { PERF_BUILD, perfLog } from "./perf.ts";

export function Profiled({ id, children }: { id: string; children: ReactNode }): ReactNode {
  if (!PERF_BUILD) return children;
  return (
    <Profiler id={id} onRender={(_id, phase, actual) => perfLog(`profile ${id} ${phase}`, actual)}>
      {children}
    </Profiler>
  );
}
