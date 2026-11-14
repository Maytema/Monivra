// Side-by-side speed comparison of the first application (Capacitor/WebView) and the React Native application on
// the same Android emulator, with the same data and the same moves, measured the same way from outside the
// applications (no instrumentation inside either):
//   - taps and swipes are sent with `adb shell input`; elements are found by their text in the accessibility tree
//     (`uiautomator dump`), so both applications are driven the same way;
//   - each move is timed from the frames the application drew (`dumpsys gfxinfo <package> framestats`): from the
//     moment just before the input command to the end of the last frame drawn within the window ("settle"), and
//     how many of those frames missed their deadline ("janky"). The input tool's own start-up time is part of every
//     number and is the same for both applications.
// Results: <out>/<app>/results.json, steps.txt, screenshots and accessibility dumps per move.
// Usage: node tools/audit/compare.mjs <out-dir> <app>=<apk> [<app>=<apk> ...]   (app: old | rn)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const [outRoot, ...pairs] = process.argv.slice(2);
const APPS = {
  old: { pkg: "app.monivra.finance.dev", activity: "app.monivra.finance.dev/app.monivra.finance.MainActivity" },
  rn: { pkg: "app.monivra.finance.next", activity: "app.monivra.finance.next/.MainActivity" },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adb = (...args) => {
  try {
    return execFileSync("adb", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    return `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
};
const sh = (cmd) => adb("shell", cmd);

let out = "";
let pkg = "";
const log = (line) => {
  console.log(line);
  appendFileSync(join(out, "steps.txt"), `${new Date().toISOString().slice(11, 19)} ${line}\n`);
};

// ---- Finding things on the screen --------------------------------------------------------------------------

function dump() {
  sh("uiautomator dump /sdcard/ui.xml >/dev/null 2>&1");
  return sh("cat /sdcard/ui.xml");
}
const unescape = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
function nodes(xml) {
  const list = [];
  for (const m of xml.matchAll(/<node [^>]*>/g)) {
    const attr = (name) => unescape(m[0].match(new RegExp(` ${name}="([^"]*)"`))?.[1] ?? "");
    const b = attr("bounds").match(/\d+/g)?.map(Number);
    if (!b) continue;
    list.push({ text: attr("text"), desc: attr("content-desc"), clickable: attr("clickable") === "true", bounds: b });
  }
  return list;
}
// The element whose text or description is `want` (exactly, or starting with it when `prefix`); `which` picks
// the first or the last of several.
function find(want, { which = "first", prefix = false, xml = dump() } = {}) {
  const match = (s) => (prefix ? s.startsWith(want) : s === want);
  const found = nodes(xml).filter((n) => (match(n.text) || match(n.desc)) && n.bounds[2] > n.bounds[0] && n.bounds[3] > n.bounds[1]);
  if (!found.length) return null;
  const n = which === "last" ? found.at(-1) : found[0];
  return { x: Math.round((n.bounds[0] + n.bounds[2]) / 2), y: Math.round((n.bounds[1] + n.bounds[3]) / 2), bounds: n.bounds };
}
async function tap(want, options = {}) {
  let at = find(want, options);
  if (!at) {
    // A system window of the busy emulator ("… isn't responding") is answered Wait.
    const xml = dump();
    if (xml.includes("isn't responding")) {
      const wait = find("Wait", { xml });
      if (wait) sh(`input tap ${wait.x} ${wait.y}`), await sleep(1000);
      at = find(want, options);
    }
  }
  if (!at) {
    log(`NOT FOUND: ${want}`);
    return false;
  }
  sh(`input tap ${at.x} ${at.y}`);
  log(`tapped: ${want}`);
  await sleep(options.pause ?? 1500);
  return true;
}

// ---- Frames ------------------------------------------------------------------------------------------------

const uptimeNs = () => Math.round(Number(sh("cat /proc/uptime").split(/\s+/)[0]) * 1e9);
function frames() {
  const text = sh(`dumpsys gfxinfo ${pkg} framestats`);
  const rows = [];
  for (const section of text.split("---PROFILEDATA---").slice(1, -1).filter((_s, i) => i % 2 === 0)) {
    const lines = section.trim().split("\n");
    const head = lines[0]?.split(",") ?? [];
    const col = (name) => head.indexOf(name);
    const [iv, done, flags] = [col("IntendedVsync"), col("FrameCompleted"), col("Flags")];
    for (const line of lines.slice(1)) {
      const v = line.split(",").map(Number);
      if (v[flags] !== 0 || !v[iv] || !v[done]) continue; // skip frames marked unusable
      rows.push({ start: v[iv], end: v[done] });
    }
  }
  return rows;
}
const pct = (list, p) => {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

// One measured move: `act` sends the input; the frames drawn in the next `windowMs` are read.
async function measure(name, act, windowMs = 4000) {
  sh(`dumpsys gfxinfo ${pkg} reset`);
  const t0 = uptimeNs();
  const ok = await act();
  await sleep(windowMs);
  // Frames of this move only, in order; a frame of more than ten seconds is a bad record and left out.
  const list = frames()
    .filter((f) => f.start >= t0 - 5e6 && f.end > f.start && f.end - f.start < 10e9)
    .sort((a, b) => a.start - b.start);
  const durations = list.map((f) => (f.end - f.start) / 1e6);
  // "Settled": the end of the burst of frames that the input started — the last frame before the first quiet
  // gap of 250 ms. Frames after that gap (a looping animation, a blinking cursor) are not part of the move.
  let settled = list[0]?.end ?? null;
  for (let i = 1; i < list.length; i++) {
    if (list[i].start - list[i - 1].end > 250e6) break;
    settled = list[i].end;
  }
  const result = {
    name,
    ok: ok !== false,
    frames: list.length,
    firstFrameMs: list.length ? Math.round((list[0].start - t0) / 1e6) : null,
    settleMs: settled === null ? null : Math.round((settled - t0) / 1e6),
    janky: durations.filter((d) => d > 16.7).length,
    p50: pct(durations, 50) && Math.round(pct(durations, 50)),
    p95: pct(durations, 95) && Math.round(pct(durations, 95)),
    worst: durations.length ? Math.round(Math.max(...durations)) : null,
  };
  log(`measured: ${JSON.stringify(result)}`);
  return result;
}
const shot = (name) => {
  sh(`screencap -p /sdcard/s.png`);
  adb("pull", "/sdcard/s.png", join(out, `${name}.png`));
  writeFileSync(join(out, `${name}.xml`), dump());
};

// ---- The moves ---------------------------------------------------------------------------------------------

const flick = (up) => sh(up ? "input swipe 540 1700 540 600 120" : "input swipe 540 600 540 1700 120");
const swipePeriod = (toPrevious) => sh(toPrevious ? "input swipe 150 1300 950 1300 200" : "input swipe 950 1300 150 1300 200");

// Waits until a text is on the screen (the first start of a WebView can take long); true when it came.
async function waitFor(want, seconds) {
  for (let i = 0; i < seconds / 2; i++) {
    if (find(want)) return true;
    await sleep(2000);
  }
  log(`NOT SHOWN within ${seconds}s: ${want}`);
  return false;
}

async function loadData() {
  // The same file and the same way for both applications: More → Data → Data file → Restore from file → Replace.
  // The file is put on the phone again just before, and checked, so the picker lists it.
  sh("mkdir -p /sdcard/Download");
  log(adb("push", "perf-data.json", "/sdcard/Download/perf-data.json").trim().split("\n").at(-1) ?? "");
  sh("am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Download/perf-data.json");
  log(`on the phone: ${sh("ls -l /sdcard/Download/perf-data.json").trim()}`);
  sh("am force-stop " + pkg);
  for (let attempt = 1; attempt <= 3; attempt++) {
    log(sh(`am start -W -n ${APPS[current].activity}`).match(/Status: \w+|Error.*$/m)?.[0] ?? "started?");
    if (await waitFor("Start with basic set", 40)) break;
  }
  await tap("Start with basic set", { pause: 4000 });
  await tap("More");
  await tap("Data");
  await tap("Data file");
  await tap("Restore from file", { pause: 4000 });
  if (!(await tap("perf-data.json", { pause: 6000 }))) {
    await tap("Show roots");
    await tap("Downloads");
    await tap("List view");
    await tap("perf-data.json", { pause: 6000 });
  }
  shot("00-restore-page");
  await tap("Replace data", { which: "last" });
  await tap("Confirm", { pause: 8000 });
  shot("01-after-restore");
}

let current = "";
async function runApp(app, apk) {
  current = app;
  pkg = APPS[app].pkg;
  out = join(outRoot, app);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "steps.txt"), "");
  log(`app ${app}: ${pkg}, ${apk}`);
  log(adb("install", "-r", apk).trim().split("\n").at(-1));
  writeFileSync(join(out, "package.txt"), sh(`dumpsys package ${pkg} | grep -E "versionName|versionCode|flags=|pkgFlags"`));
  await loadData();
  const results = [];
  const R = (r) => results.push(r);

  // Cold starts with the full data (three times).
  for (let i = 1; i <= 3; i++) {
    sh("am force-stop " + pkg);
    await sleep(2000);
    const amStart = sh(`am start -W -n ${APPS[app].activity}`);
    log(`am start: ${amStart.match(/TotalTime: \d+/)?.[0] ?? "?"}`);
    sh(`am force-stop ${pkg}`);
    await sleep(2000);
    R(await measure(`cold start ${i}`, async () => sh(`am start -n ${APPS[app].activity}`), 12000));
  }
  shot("02-started");

  // Tabs: the first opening of each, then once more.
  for (const round of ["first", "again"])
    for (const tab of ["Operations", "Statistics", "Categories", "Accounts"]) R(await measure(`tab ${tab} (${round})`, () => tap(tab, { pause: 0 }), 3000));

  // The operations list: flicks down and up, then period swipes.
  await tap("Operations", { pause: 3000 });
  shot("03-operations");
  R(await measure("operations: 6 flicks down", async () => { for (let i = 0; i < 6; i++) flick(true), await sleep(700); }, 2500));
  R(await measure("operations: 6 flicks up", async () => { for (let i = 0; i < 6; i++) flick(false), await sleep(700); }, 2500));
  for (let i = 1; i <= 3; i++) R(await measure(`operations: swipe to previous period ${i}`, async () => swipePeriod(true), 3000));
  for (let i = 1; i <= 3; i++) R(await measure(`operations: swipe to next period ${i}`, async () => swipePeriod(false), 3000));
  shot("04-operations-after-swipes");

  // Categories and statistics: period swipes.
  await tap("Categories", { pause: 3000 });
  shot("05-categories");
  for (let i = 1; i <= 3; i++) R(await measure(`categories: swipe to previous period ${i}`, async () => swipePeriod(true), 3000));
  for (let i = 1; i <= 3; i++) R(await measure(`categories: swipe to next period ${i}`, async () => swipePeriod(false), 3000));
  await tap("Statistics", { pause: 3000 });
  shot("06-statistics");
  for (let i = 1; i <= 3; i++) R(await measure(`statistics: swipe to previous period ${i}`, async () => swipePeriod(true), 3000));
  for (let i = 1; i <= 3; i++) R(await measure(`statistics: swipe to next period ${i}`, async () => swipePeriod(false), 3000));
  R(await measure("statistics: 3 flicks down", async () => { for (let i = 0; i < 3; i++) flick(true), await sleep(700); }, 2500));

  // The currency list (about 200 currencies) from the settings: open, then fast flicks through it.
  await tap("More");
  await tap("Settings", { pause: 2500 });
  await tap("Formatting", { pause: 2500 });
  shot("07-formatting");
  R(await measure("currency list: open", () => tap("Main currency", { pause: 0 }), 4000));
  shot("08-currency-list");
  R(await measure("currency list: 8 fast flicks", async () => { for (let i = 0; i < 8; i++) flick(true), await sleep(250); }, 2500));
  shot("09-currency-list-flicked");
  sh("input keyevent 4");
  await sleep(1500);
  sh("input keyevent 4");
  await sleep(1500);

  writeFileSync(join(out, "results.json"), JSON.stringify(results, null, 1));
  sh(`am force-stop ${pkg}`);
}

for (const pair of pairs) {
  const [app, apk] = pair.split("=");
  if (!APPS[app]) throw new Error(`unknown app ${app}`);
  await runApp(app, apk);
}
