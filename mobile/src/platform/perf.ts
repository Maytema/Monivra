// Timings written to the system log ("[perf] …"), read by the emulator checks: the slow spots are measured
// on the phone's engine instead of guessed. A line costs almost nothing; the watch and the probe below run
// only in the build made for the speed check (EXPO_PUBLIC_PERF=1, the emulator leg of CI), never on a phone.
export const now = (): number => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());

export const PERF_BUILD = process.env.EXPO_PUBLIC_PERF === "1";

export function perfLog(label: string, ms: number): void {
  console.log(`[perf] ${label} ${ms.toFixed(1)}ms`);
}

// The JavaScript thread is busy for as long as a timer comes late: every pause longer than a few frames is
// written down ("[perf] stall 240.0ms"). The check script writes a mark before each thing it does, so a
// stall is read against the last mark.
const STEP_MS = 25;
const WORTH_MS = 50;
let watching = false;
export function watchStalls(): void {
  if (!PERF_BUILD || watching) return;
  watching = true;
  let last = now();
  setInterval(() => {
    const at = now();
    const late = at - last - STEP_MS;
    if (late > WORTH_MS) perfLog("stall", late);
    last = at;
  }, STEP_MS);
}

// Once per start of the speed-check build: what the platform's formatting and collation cost on this engine,
// against the plain arithmetic that replaced them (it blocks the thread for a second, so never on a phone).
let probed = false;
export function probeEngine(): void {
  if (!PERF_BUILD || probed) return;
  probed = true;
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
}
