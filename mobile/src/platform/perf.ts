// Timings written to the system log ("[perf] …"), read by the emulator test: the slow spots are measured
// on the phone's engine instead of guessed. Cheap enough to stay in the application.
export const now = (): number => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());

export function perfLog(label: string, ms: number): void {
  console.log(`[perf] ${label} ${ms.toFixed(1)}ms`);
}

// Once per start, when the application is idle: what the platform's formatting and collation cost on this
// engine, against the plain arithmetic that replaced them.
let probed = false;
export function probeEngine(): void {
  if (probed) return;
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
