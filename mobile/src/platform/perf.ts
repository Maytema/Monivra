// Timings written to the system log ("[perf] …"), read by the emulator checks: the slow spots are measured
// on the phone's engine instead of guessed. A line costs almost nothing; the watch and the probe below run
// only in the build made for the speed check (EXPO_PUBLIC_PERF=1, the emulator leg of CI), never on a phone.
import { AppState } from "react-native";

export const now = (): number => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());

export const PERF_BUILD = process.env.EXPO_PUBLIC_PERF === "1";
// When a tile of the period dialog was tapped (speed-check build): the layer that goes away next writes the time since.
export const perfMark = { tap: 0 };

export function perfLog(label: string, ms: number): void {
  console.log(`[perf] ${label} ${ms.toFixed(1)}ms`);
}

// A plain line (speed-check build only): what happened, without a time.
export function perfNote(text: string): void {
  if (PERF_BUILD) console.log(`[perf] ${text}`);
}

// Touches (speed-check build only). The system stamps a touch when the finger lands; the JavaScript thread sees it
// when it is free. The two clocks have different starts, so the delay is read against the quickest touch seen:
// "touch lag 180ms" means this touch waited 180 ms longer than the quickest one for the thread.
let touchBase = Number.POSITIVE_INFINITY;
let lastTouch = 0;
export function noteTouch(timestamp: number, touches = 1): void {
  if (!PERF_BUILD) return;
  // A finger landing while JavaScript still counts another finger down: a touch whose end never reached it (a
  // native view took the gesture without telling). The responder system then treats the new finger as a second one.
  if (touches > 1) perfNote(`touch start with ${touches} touches active`);
  const at = now();
  lastTouch = at;
  const gap = at - timestamp;
  if (gap < touchBase) touchBase = gap;
  const lag = gap - touchBase;
  if (lag > 16) perfLog("touch lag", lag);
}
// The time from the last touch to now ("tab shown Statistics 420ms": from the finger to the drawn screen).
export function sinceTouch(label: string): void {
  if (PERF_BUILD && lastTouch) perfLog(label, now() - lastTouch);
}

// The JavaScript thread is busy for as long as a timer comes late: every pause longer than a few frames is
// written down ("[perf] stall 240.0ms"). The check script writes a mark before each thing it does, so a
// stall is read against the last mark.
// Not counted: the time the application is not in front (a system window such as the file picker is; timers
// wait meanwhile, which is not the thread being busy), and the engine probe below (it measures itself).
const STEP_MS = 25;
const WORTH_MS = 50;
let watching = false;
let probing = false;
// Speed-check build: switches that attribute the cost of a part by leaving it out. `noIcons` draws every icon as an empty box,
// `plainRows` draws a row as a bare text line. scripts/emulator-perf.sh taps the small box PerfSwitch draws at the top left; each
// tap moves to the next setting: all on, icons off, plain rows, all on again.
export const perfFlags = { noIcons: false, plainRows: false };
let setting = 0;
export function nextPerfSetting(): string {
  setting = (setting + 1) % 3;
  perfFlags.noIcons = setting === 1;
  perfFlags.plainRows = setting === 2;
  const name = ["all on", "icons off", "plain rows"][setting]!;
  console.log(`[perf] setting ${name}`);
  return name;
}

export function watchStalls(): void {
  if (!PERF_BUILD || watching) return;
  watching = true;
  let last = now();
  let away = AppState.currentState !== "active";
  AppState.addEventListener("change", (state) => {
    away = state !== "active";
    last = now();
  });
  setInterval(() => {
    const at = now();
    const late = at - last - STEP_MS;
    if (late > WORTH_MS && !away && !probing) perfLog("stall", late);
    last = at;
  }, STEP_MS);
}

// Once per start of the speed-check build: what the platform's formatting and collation cost on this engine,
// against the plain arithmetic that replaced them (it blocks the thread for a second, so never on a phone).
let probed = false;
export function probeEngine(): void {
  if (!PERF_BUILD || probed) return;
  probed = true;
  probing = true;
  const time = (label: string, run: () => void) => {
    const start = now();
    run();
    perfLog(label, now() - start);
  };
  const N = 200;
  time(`engine toLocaleString x${N}`, () => {
    for (let i = 0; i < N; i++) (i * 1234.56).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });
  });
  time(`engine plain format x${N}`, () => {
    for (let i = 0; i < N; i++) String(Math.round(i * 123456)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  });
  time(`engine localeCompare x${N}`, () => {
    for (let i = 0; i < N; i++) "2026-11-12".localeCompare("2026-11-1" + (i % 10));
  });
  time(`engine toLocaleDateString x${N}`, () => {
    for (let i = 0; i < N; i++) new Date(Date.UTC(2026, 0, 1 + i)).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  });
  // The pause it made is not one of the application's: the next tick of the watch starts afresh.
  setTimeout(() => (probing = false), STEP_MS * 3);
}

// How often components draw (speed-check build only): `countRender("operations page")` in a component's body
// adds one each time it renders; the counts of each second are written as "[perf] renders <name> <n>", so a
// part that keeps drawing while nothing happens shows up by name.
const renders = new Map<string, number>();
let flushing = false;
// Speed-check build: the time a component's own function body takes (hooks, formatting, building its elements; not its
// children, which draw after it): `const done = selfTime("row"); ... done();` just before the return. Written each second as
// "render time <name> <n> draws <ms> ms" (React.Profiler does not run in a release build).
const spent = new Map<string, { n: number; ms: number }>();
export function selfTime(name: string): () => void {
  if (!PERF_BUILD) return () => undefined;
  const start = now();
  return () => {
    const row = spent.get(name) ?? { n: 0, ms: 0 };
    row.n += 1;
    row.ms += now() - start;
    spent.set(name, row);
  };
}
if (PERF_BUILD)
  setInterval(() => {
    for (const [key, row] of spent) console.log(`[perf] render time ${key} ${row.n} draws ${row.ms.toFixed(1)}ms`);
    spent.clear();
  }, 1000);

export function countRender(name: string): void {
  if (!PERF_BUILD) return;
  renders.set(name, (renders.get(name) ?? 0) + 1);
  if (flushing) return;
  flushing = true;
  setInterval(() => {
    for (const [key, n] of renders) if (n) console.log(`[perf] renders ${key} ${n}`);
    renders.clear();
  }, 1000);
}
