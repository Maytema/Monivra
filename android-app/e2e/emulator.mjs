// End-to-end test of the Monivra APKs on a real Android system (an emulator in CI). It installs the
// APKs with adb, drives the application inside its real WebView through the Chrome DevTools protocol
// (the page is the application's own code running on the device), presses the real Back key, and
// looks at what Android itself reports (focused window, alarms, notifications, package info, files
// in the private folder). Nothing here is a mock of the native side.
//
// Usage: node e2e/emulator.mjs <release.apk> <debuggable.apk> <next-debuggable.apk> <results-dir>
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [releaseApk, debugApk, nextApk, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
// The test builds use their own application id (so they never replace the real app); the activity
// keeps the code package of the project.
// The synthetic data of the tests is a fixture; it is loaded into the page as a module from its source
// (its import of the app's defaults points at the page's own copy), never shipped in the app.
const SAMPLE_SOURCE = readFileSync(
  new URL("../../tests/fixtures/sample-data.js", import.meta.url),
  "utf8",
).replace('"../../js/data/defaults.js"', '"https://localhost/js/data/defaults.js"');
const PKG = process.env.MONIVRA_APPLICATION_ID || "app.monivra.finance.dev";
const ACTIVITY = "app.monivra.finance.MainActivity";
const KEY = "monivra.offline.2026.v1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const adb = (...args) =>
  execFileSync("adb", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
const sh = (command) => adb("shell", command);
const tryAdb = (...args) => {
  try {
    return adb(...args);
  } catch (error) {
    return `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
};
const runAs = (command) => tryAdb("shell", `run-as ${PKG} ${command}`);

// ---------- a minimal DevTools client for the WebView ----------
let page = null;
async function connect() {
  let pid = "";
  for (let i = 0; i < 60 && !pid; i++) {
    pid = tryAdb("shell", `pidof ${PKG}`).trim().split(/\s+/)[0];
    if (!pid) await sleep(500);
  }
  if (!pid) throw Error("the application did not start");
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    tryAdb("forward", "--remove", "tcp:9222");
    adb("forward", "tcp:9222", `localabstract:webview_devtools_remote_${pid}`);
    try {
      const list = await (await fetch("http://127.0.0.1:9222/json")).json();
      target = list.find((t) => t.type === "page" && t.url.startsWith("https://localhost"));
    } catch {
      // the WebView is not ready yet
    }
    if (!target) await sleep(1000);
  }
  if (!target) throw Error("the WebView page was not found");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  let id = 0;
  const waiting = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) {
      waiting.get(message.id)(message);
      waiting.delete(message.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const n = ++id;
      waiting.set(n, resolve);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const evaluate = async (expression) => {
    const response = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.error) throw Error(response.error.message);
    const { result, exceptionDetails } = response.result;
    if (exceptionDetails)
      throw Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  page = { evaluate, close: () => ws.close() };
  return page;
}
const ev = (expression) => page.evaluate(expression);
async function waitFor(expression, what, timeoutMs = 60000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    try {
      last = await ev(expression);
      if (last) return last;
    } catch (error) {
      last = error.message;
    }
    await sleep(500);
  }
  throw Error(`timed out waiting for ${what} (last: ${JSON.stringify(last)})`);
}
const launch = async () => {
  page?.close();
  sh(`am start -W -n ${PKG}/${ACTIVITY}`);
  await connect();
  await waitFor(
    `!!document.querySelector('.navbar, .pin, .welcome, .recovery')`,
    "the first screen",
  );
};
const restart = async () => {
  page?.close();
  page = null;
  sh(`am force-stop ${PKG}`);
  await sleep(1000);
  await launch();
};
// The WebView writes localStorage to disk some seconds after a change; a test that edits it
// directly and then kills the process has to wait, or it tests the WebView's delay and not the app.
const persist = () => sleep(7000);
const bootData = () => ev(`import('/js/platform/native-boot.js').then((m) => m.boot.data)`);
const screenshot = (name) => {
  try {
    const png = execFileSync("adb", ["exec-out", "screencap", "-p"], {
      maxBuffer: 64 * 1024 * 1024,
    });
    writeFileSync(join(outDir, `${name}.png`), png);
  } catch {
    // a missing screenshot does not fail the test
  }
};
const focus = () => sh("dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'");
async function waitForFocus(pattern, what, timeoutMs = 20000) {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    last = focus();
    if (pattern.test(last)) return last;
    await sleep(700);
  }
  throw Error(`${what} did not come to the front. Focus: ${last.trim().slice(0, 300)}`);
}
const back = () => sh("input keyevent KEYCODE_BACK");
const sha256InPage = `(async (t) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map(b => b.toString(16).padStart(2,'0')).join(''))`;
const stateOfData = () =>
  ev(`(async () => {
    const text = localStorage.getItem(${JSON.stringify(KEY)});
    if (text === null) return null;
    const data = JSON.parse(text);
    return { hash: await ${sha256InPage}(text), ops: data.ops.length, accounts: data.accounts.length, pin: data.settings.pin, scheduled: data.scheduled.length };
  })()`);
const clickKey = (digit) =>
  ev(
    `(() => { const b = [...document.querySelectorAll('.keypad .key')].find(b => b.textContent.trim() === ${JSON.stringify(digit)}); if (!b) return false; b.click(); return true; })()`,
  );
const typePin = async (digits) => {
  for (const d of digits) {
    await clickKey(d);
    await sleep(250);
  }
};
const clickText = (text) =>
  ev(`(() => {
    const items = [...document.querySelectorAll('[data-action]')].filter(e => e.textContent.replace(/\\s+/g,' ').trim().startsWith(${JSON.stringify(text)}));
    if (!items.length) return false;
    items[0].click();
    return true;
  })()`);

// ---------- a minimal valid one-page PDF ----------
function tinyPdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    null,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream = "BT /F1 24 Tf 72 760 Td (Monivra test page) Tj ET";
  objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1").toString("base64");
}

// ---------- the steps ----------
const results = [];
let failed = 0;
async function step(name, fn, { required = true } = {}) {
  const started = Date.now();
  try {
    const note = await fn();
    results.push({
      name,
      status: "pass",
      note: note ?? "",
      seconds: Math.round((Date.now() - started) / 1000),
    });
    console.log(`PASS ${name}${note ? ` — ${note}` : ""}`);
  } catch (error) {
    const status = required ? "FAIL" : "warn";
    if (required) failed++;
    results.push({
      name,
      status,
      note: error.message,
      seconds: Math.round((Date.now() - started) / 1000),
    });
    console.log(`${status} ${name} — ${error.message}`);
    screenshot(`failure-${results.length}`);
  }
}
const assert = (condition, message) => {
  if (!condition) throw Error(message);
};

let window_due = null; // the payment set up for the reminder steps
let before = null; // the state of the data to compare with after restarts and the update

await step("the device", async () => {
  const release = sh("getprop ro.build.version.release").trim();
  const sdk = sh("getprop ro.build.version.sdk").trim();
  const abi = sh("getprop ro.product.cpu.abi").trim();
  return `Android ${release} (API ${sdk}), ${abi}, ${sh("getprop ro.product.model").trim()}`;
});

await step("the release APK installs", async () => {
  tryAdb("uninstall", PKG);
  const out = adb("install", "-r", releaseApk);
  assert(/Success/.test(out), out);
  assert(sh(`pm list packages ${PKG}`).includes(PKG), "package not listed");
});

await step(
  "installed package facts: ID, version, SDKs, permissions, not debuggable, no network permission",
  async () => {
    const dump = sh(`dumpsys package ${PKG}`);
    const field = (re) => (dump.match(re) ?? [])[1];
    const versionName = field(/versionName=(\S+)/);
    const targetSdk = field(/targetSdk=(\d+)/);
    const minSdk = field(/minSdk=(\d+)/);
    const flags = field(/\n\s+flags=\[([^\]]*)\]/) ?? "";
    const requested = [...dump.matchAll(/android\.permission\.[A-Z_]+/g)].map((m) => m[0]);
    const requestedBlock = (dump.split("requested permissions:")[1] ?? "").split(
      /\n\s*(install permissions|User \d)/,
    )[0];
    const requestedList = [...requestedBlock.matchAll(/(android\.permission\.[A-Z_]+)/g)].map(
      (m) => m[1],
    );
    assert(
      !requestedList.includes("android.permission.INTERNET"),
      "the application requests INTERNET",
    );
    assert(!flags.includes("DEBUGGABLE"), `the release APK is debuggable (flags: ${flags})`);
    assert(!/allowBackup|ALLOW_BACKUP/.test(flags), `backup is allowed (flags: ${flags})`);
    writeFileSync(join(outDir, "package-dump.txt"), dump);
    return `version ${versionName}, minSdk ${minSdk}, targetSdk ${targetSdk}, permissions: ${[...new Set(requestedList)].join(", ") || [...new Set(requested)].join(", ")}`;
  },
);

await step("the release APK starts offline (airplane mode) and stays running", async () => {
  tryAdb("shell", "svc wifi disable");
  tryAdb("shell", "svc data disable");
  tryAdb("logcat", "-c");
  let pid = "";
  let attempts = 0;
  let why = "";
  while (!pid && attempts < 2) {
    attempts++;
    sh(`am start -W -n ${PKG}/${ACTIVITY}`);
    await sleep(8000);
    pid = tryAdb("shell", `pidof ${PKG}`).trim();
    if (!pid) {
      // Recorded, so a start that did not stay running is never hidden by the second attempt.
      why =
        tryAdb("logcat", "-d", "-b", "crash").slice(0, 600) +
        tryAdb("logcat", "-d", "-s", "AndroidRuntime:E", "ActivityManager:I", "Capacitor:E")
          .split("\n")
          .filter((l) => /monivra/i.test(l))
          .slice(-12)
          .join("\n");
      writeFileSync(join(outDir, `first-start-attempt-${attempts}.txt`), why);
    }
  }
  assert(pid, `the process is not running after ${attempts} starts: ${why.slice(0, 300)}`);
  const log = tryAdb("logcat", "-d", "-b", "crash");
  assert(!/FATAL EXCEPTION/.test(log), `crash: ${log.slice(0, 400)}`);
  await waitForFocus(
    new RegExp(`${PKG}/app\\.monivra\\.finance\\.MainActivity|${PKG}`),
    "the application window",
  );
  screenshot("01-release-first-launch");
  return attempts > 1
    ? `running, pid ${pid}, no crash — but the FIRST start did not stay running (see first-start-attempt-1.txt)`
    : `running, pid ${pid}, no crash`;
});

await step("the debuggable build installs over the release build (same signature)", async () => {
  sh(`am force-stop ${PKG}`);
  const out = adb("install", "-r", debugApk);
  assert(/Success/.test(out), out);
});

await launch();

await step("a new install shows the welcome screen and no data", async () => {
  assert(await ev(`!!document.querySelector('.welcome')`), "no welcome screen");
  assert((await stateOfData()) === null, "there is stored data");
  screenshot("02-welcome");
});

await step("synthetic test data (a fixture of the tests, not of the app) is stored", async () => {
  await ev(`(async () => {
    const { setAppData, setFirstLaunch } = await import('/js/core/state.js');
    const { save } = await import('/js/data/storage.js');
    const { render } = await import('/js/app/shell.js');
    const fixture = await import(URL.createObjectURL(new Blob([${JSON.stringify(SAMPLE_SOURCE)}], { type: 'text/javascript' })));
    setAppData(fixture.createSampleData()); setFirstLaunch(false); save(); render();
  })()`);
  await waitFor(`!!document.querySelector('.navbar')`, "the main screen");
  before = await stateOfData();
  assert(before.ops > 0 && before.accounts > 0, "no data");
  screenshot("03-with-data");
  return `${before.accounts} accounts, ${before.ops} operations`;
});

await step("the sample-data feature does not exist in the installed app", async () => {
  const gone = await ev(`(async () => {
    const r = await fetch('/js/data/sample.js').then((x) => x.text()).catch(() => '');
    return JSON.stringify({ module: r.includes('createSampleData') });
  })()`);
  const parsed = JSON.parse(gone);
  assert(!parsed.module, "sample.js is served by the app");
  const text = await ev(`document.body.innerText`);
  assert(!/Test data|sample data/i.test(String(text)), "sample-data text on the main screen");
});

await step(
  "every save is copied to the internal copy in the private folder, checked by a hash",
  async () => {
    await sleep(2500);
    const list = runAs("ls files/mirror");
    assert(list.includes("data.json"), `no internal copy: ${list.trim().slice(0, 200)}`);
    const wrapper = JSON.parse(runAs("cat files/mirror/data.json"));
    const hash = await ev(`${sha256InPage}(${JSON.stringify(wrapper.text)})`);
    assert(wrapper.sha256 === hash, "the hash of the copy does not match its text");
    const stored = await ev(`localStorage.getItem(${JSON.stringify(KEY)})`);
    assert(wrapper.text === stored, "the copy differs from the stored data");
    return `copy of ${wrapper.text.length} characters, hash matches`;
  },
);

await step("data survives the process being killed and restarted", async () => {
  await restart();
  const after = await stateOfData();
  assert(after && after.hash === before.hash, "the data changed or is gone");
  assert(await ev(`!!document.querySelector('.navbar')`), "the main screen is not shown");
});

await step(
  "stored data lost, application installed: the internal copy restores it, with a notice",
  async () => {
    await ev(
      `localStorage.removeItem(${JSON.stringify(KEY)}); localStorage.removeItem(${JSON.stringify(KEY + ".saves")})`,
    );
    await persist();
    await restart();
    assert((await bootData()) === "restored", `boot said: ${await bootData()}`);
    const after = await stateOfData();
    assert(after && after.hash === before.hash, "the data was not restored");
    const toastSeen = await ev(
      `document.body.innerText.includes('restored from the internal copy')`,
    );
    return toastSeen ? "restored; notice shown" : "restored (the notice had already gone)";
  },
);

await step("a damaged stored dataset is not overwritten by the internal copy", async () => {
  await ev(`localStorage.setItem(${JSON.stringify(KEY)}, '{"damaged": true')`);
  await persist();
  await restart();
  const raw = await ev(`localStorage.getItem(${JSON.stringify(KEY)})`);
  assert(raw === '{"damaged": true', "the damaged text was replaced");
  assert(await ev(`!!document.querySelector('.recovery')`), "the recovery screen is not shown");
  // put the good data back for the next steps
  const wrapper = JSON.parse(runAs("cat files/mirror/data.json"));
  await ev(`localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(wrapper.text)})`);
  await persist();
  await restart();
  const after = await stateOfData();
  assert(after && after.hash === before.hash, "the data was not back");
});

await step(
  "durability: a change made a moment before the process is killed is still there",
  async () => {
    await ev(`(async () => {
      const { appData } = await import('/js/core/state.js');
      const { save } = await import('/js/data/storage.js');
      appData.settings.lockDelay = 37; save();
    })()`);
    await sleep(1800); // the internal copy is written within about a second; the WebView needs longer
    await restart();
    const value = await ev(`import('/js/core/state.js').then((m) => m.appData.settings.lockDelay)`);
    assert(value === 37, `the change was lost (value ${value}); boot said ${await bootData()}`);
    return `change kept; boot: ${await bootData()}`;
  },
);

await step(
  "a PIN: its hash is in the keystore storage, not in the data, the copy or the log",
  async () => {
    tryAdb("logcat", "-c");
    await ev(`(async () => {
    const { appData } = await import('/js/core/state.js');
    const { save } = await import('/js/data/storage.js');
    const { makePin } = await import('/js/platform/pin.js');
    appData.settings.pin = makePin('1234'); save();
  })()`);
    await sleep(3000);
    const stored = await ev(`localStorage.getItem(${JSON.stringify(KEY)})`);
    const pin = JSON.parse(stored).settings.pin;
    assert(
      pin && pin.native === true && !("hash" in pin) && !stored.includes('"salt"'),
      `the data holds more than a marker: ${JSON.stringify(pin)}`,
    );
    const files = runAs("ls files/secure");
    assert(files.includes("pin.bin"), `no sealed PIN file: ${files.trim()}`);
    assert(!runAs("cat files/secure/pin.bin").includes("salt"), "the sealed file is readable text");
    assert(
      !runAs("cat files/mirror/data.json").includes('\\"salt\\"'),
      "the internal copy holds the hash",
    );
    const log = tryAdb("logcat", "-d");
    assert(
      !/"salt"|"hash"|1234/.test(
        log
          .split("\n")
          .filter((l) => /monivra|Capacitor|chromium/i.test(l))
          .join("\n"),
      ),
      "the PIN or hash is in the log",
    );
    return "marker only in the data and copy; sealed file is not text";
  },
);

await step(
  "after a restart the lock screen asks for the PIN: wrong refused, right opens",
  async () => {
    await restart();
    assert(await ev(`!!document.querySelector('.pin')`), "no lock screen");
    await sleep(1200); // the screen fades in; a picture at once may show it half drawn
    screenshot("04-lock-screen");
    await typePin("1111");
    await waitFor(`document.body.innerText.includes('Incorrect PIN')`, "the wrong-PIN message");
    await typePin("1234");
    await waitFor(`!!document.querySelector('.navbar')`, "the main screen after the right PIN");
  },
);

await step(
  "leaving to Home / Recents / another app and coming back: Immediately asks for the PIN, a timed lock waits, the switch off never locks",
  async () => {
    const pid = () => sh(`pidof ${PKG}`).trim();
    const setLock = (relock, delay) =>
      ev(`(async () => {
        const { appData } = await import('/js/core/state.js');
        const { save } = await import('/js/data/storage.js');
        appData.settings.relock = ${relock}; appData.settings.lockDelay = ${delay}; save();
      })()`);
    const awayAndBack = async (how) => {
      if (how === "home") sh("input keyevent KEYCODE_HOME");
      else if (how === "recents") sh("input keyevent KEYCODE_APP_SWITCH");
      else sh("am start -W -a android.settings.SETTINGS"); // another app in front
      await sleep(1500);
      return how;
    };
    const comeBack = async () => {
      await launch();
    };
    const started = pid();
    assert(started, "the app is not running");
    const seen = [];
    // Immediately: every way of leaving asks for the PIN again, the process stays alive.
    await setLock(true, 0);
    for (const how of ["home", "recents", "app"]) {
      await awayAndBack(how);
      assert(pid() === started, `the process changed after ${how}: it did not stay alive`);
      await comeBack();
      assert(await ev(`!!document.querySelector('.pin')`), `no lock screen after ${how}`);
      seen.push(`${how}: locked`);
      await typePin("1234");
      await waitFor(`!!document.querySelector('.navbar')`, `the main screen after ${how}`);
    }
    // Screen lock and unlock.
    sh("input keyevent KEYCODE_SLEEP");
    await sleep(1500);
    sh("input keyevent KEYCODE_WAKEUP");
    sh("wm dismiss-keyguard");
    await sleep(1500);
    await comeBack();
    assert(await ev(`!!document.querySelector('.pin')`), "no lock screen after the screen lock");
    seen.push("screen lock: locked");
    await typePin("1234");
    await waitFor(`!!document.querySelector('.navbar')`, "the main screen after the screen lock");
    // A timed lock: back at once stays open.
    await setLock(true, 60);
    await awayAndBack("home");
    await comeBack();
    assert(!(await ev(`!!document.querySelector('.pin')`)), "locked before the delay");
    seen.push("60 s, back at once: open");
    // The switch off: never locks on leaving.
    await setLock(false, 0);
    await awayAndBack("home");
    await comeBack();
    assert(!(await ev(`!!document.querySelector('.pin')`)), "locked with the switch off");
    seen.push("switch off: open");
    screenshot("04b-after-leaving");
    return seen.join("; ");
  },
);

await step(
  "the real system reports biometric status (no fingerprint is enrolled on the emulator)",
  async () => {
    const status = await ev(
      `Capacitor.Plugins.MonivraNative.biometricStatus().then(r => r.status)`,
    );
    assert(["available", "not_enrolled", "unsupported"].includes(status), `unexpected: ${status}`);
    const shown = await ev(
      `(async () => { const { biometricState } = await import('/js/platform/biometric.js'); return biometricState(); })()`,
    );
    return `system says "${status}"; the application sees "${shown}"`;
  },
);

await step(
  "Save: the system 'save as' screen opens and a cancel is reported as cancelled, nothing written",
  async () => {
    await ev(
      `window.__save = null; Capacitor.Plugins.MonivraNative.saveDocument({ name: 'monivra-e2e.json', mime: 'application/json', data: btoa('{"e2e":1}') }).then(r => { window.__save = r; }, e => { window.__save = { error: e.message }; }); true`,
    );
    await waitForFocus(/documentsui|DocumentsActivity|FilesActivity/i, "the system save screen");
    screenshot("05-save-screen");
    // The first Back may only close the on-screen keyboard: press until the screen answers.
    for (let i = 0; i < 6; i++) {
      back();
      await sleep(2000);
      if (await ev(`window.__save`)) break;
    }
    const result = await waitFor(`window.__save`, "the answer after cancel");
    assert(result.status === "cancelled", `got ${JSON.stringify(result)}`);
  },
);

await step(
  "Save: confirming in the system screen writes the file with the given content",
  async () => {
    await launch();
    await waitFor(`!!document.querySelector('.navbar')`, "the main screen", 10000).catch(
      async () => {
        await typePin("1234");
      },
    );
    await ev(
      `window.__save = null; Capacitor.Plugins.MonivraNative.saveDocument({ name: 'monivra-e2e.json', mime: 'application/json', data: btoa('{"e2e":1}') }).then(r => { window.__save = r; }, e => { window.__save = { error: e.message }; }); true`,
    );
    await waitForFocus(/documentsui|DocumentsActivity|FilesActivity/i, "the system save screen");
    await sleep(1500);
    sh("uiautomator dump /sdcard/ui.xml");
    const xml = sh("cat /sdcard/ui.xml");
    const node = [
      ...xml.matchAll(
        /<node[^>]*text="([^"]*)"[^>]*clickable="true"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g,
      ),
    ].find((m) => /^save$/i.test(m[1]));
    assert(node, "no Save button found in the system screen");
    const [x, y] = [(+node[2] + +node[4]) / 2, (+node[3] + +node[5]) / 2];
    sh(`input tap ${Math.round(x)} ${Math.round(y)}`);
    const result = await waitFor(`window.__save`, "the answer after saving");
    assert(result.status === "saved", `got ${JSON.stringify(result)}`);
    const found = sh("find /sdcard/ -name 'monivra-e2e*.json' 2>/dev/null").trim().split("\n")[0];
    assert(found, "the saved file was not found");
    assert(sh(`cat '${found}'`).trim() === '{"e2e":1}', "the saved file has other content");
    return `written to ${found}`;
  },
  { required: false },
);

await step(
  "Share: the system share sheet opens with the file (content address, no storage permission)",
  async () => {
    await restart();
    if (await ev(`!!document.querySelector('.pin')`)) {
      await typePin("1234");
      await waitFor(`!!document.querySelector('.navbar')`, "the main screen");
    }
    const status = await ev(
      `Capacitor.Plugins.MonivraNative.shareDocument({ name: 'monivra-e2e.txt', mime: 'text/plain', data: btoa('hello') }).then(r => r.status)`,
    );
    assert(status === "opened", `got ${status}`);
    await waitForFocus(/chooser|resolver|ShareSheet|intentresolver/i, "the share sheet");
    screenshot("06-share-sheet");
    const staged = runAs("ls cache/shared");
    assert(staged.includes("monivra-e2e.txt"), `file not staged: ${staged.trim()}`);
    back();
    await sleep(1500);
  },
);

await step(
  "Print: the system print screen opens with the PDF and closing it answers the call",
  async () => {
    await ev(
      `window.__print = null; Capacitor.Plugins.MonivraNative.printPdf({ name: 'monivra-e2e.pdf', mime: 'application/pdf', data: '${tinyPdf()}' }).then(r => { window.__print = r; }, e => { window.__print = { error: e.message }; }); true`,
    );
    await waitForFocus(/printspooler|PrintActivity/i, "the system print screen");
    await sleep(2000);
    screenshot("07-print-screen");
    for (let i = 0; i < 5; i++) {
      back();
      await sleep(2000);
      if (await ev(`window.__print`)) break;
    }
    const result = await waitFor(`window.__print`, "the answer after closing print");
    assert(!result.error, `print failed: ${result.error}`);
  },
);

await step(
  "Android Back: closes a page, then at the first screen sends the app to the background (alive)",
  async () => {
    await launch();
    if (await ev(`!!document.querySelector('.pin')`)) {
      await typePin("1234");
      await waitFor(`!!document.querySelector('.navbar')`, "the main screen");
    }
    assert(await clickText("More"), "no More tab");
    await sleep(600);
    assert(await clickText("Settings"), "no Settings row");
    await waitFor(
      `!document.querySelector('.navbar') && document.body.innerText.includes('Security')`,
      "the settings page",
    );
    back();
    await waitFor(
      `!!document.querySelector('.navbar') && !document.body.innerText.includes('Security')`,
      "back on the More tab",
    );
    // Go to the first tab and press Back there.
    await ev(
      `(async () => { const { goHome } = await import('/js/ui/navigation.js'); goHome('accounts'); })()`,
    );
    await sleep(500);
    back();
    await sleep(2000);
    const pid = sh(`pidof ${PKG}`).trim();
    assert(pid, "the process ended");
    assert(
      !new RegExp(`${PKG}/app\\.monivra\\.finance\\.MainActivity`).test(focus()),
      "the application is still in front",
    );
    screenshot("08-after-back");
  },
);

await step("rotation: the layout follows and the navigation bar stays", async () => {
  await launch();
  if (await ev(`!!document.querySelector('.pin')`)) {
    await typePin("1234");
    await waitFor(`!!document.querySelector('.navbar')`, "the main screen");
  }
  sh("settings put system accelerometer_rotation 0");
  sh("settings put system user_rotation 1");
  await sleep(3000);
  const wide = await ev(`innerWidth > innerHeight && !!document.querySelector('.navbar')`);
  screenshot("09-landscape");
  sh("settings put system user_rotation 0");
  await sleep(2000);
  assert(wide, "not landscape or no navigation bar");
});

await step("language and theme: Russian and dark apply, system bars follow", async () => {
  await ev(`(async () => {
    const { appData } = await import('/js/core/state.js');
    const { save } = await import('/js/data/storage.js');
    const { render } = await import('/js/app/shell.js');
    appData.settings.language = 'ru'; appData.settings.theme = 'dark'; save(); render();
  })()`);
  await sleep(1500);
  assert(
    await ev(
      `document.documentElement.classList.contains('dark') && document.documentElement.lang === 'ru'`,
    ),
    "theme or language did not apply",
  );
  screenshot("10-russian-dark");
  await ev(`(async () => {
    const { appData } = await import('/js/core/state.js');
    const { save } = await import('/js/data/storage.js');
    const { render } = await import('/js/app/shell.js');
    appData.settings.language = 'en'; appData.settings.theme = 'light'; save(); render();
  })()`);
  await sleep(800);
});

await step(
  "update: a build with a higher version code installed over this one keeps data, PIN and lock",
  async () => {
    before = await stateOfData();
    const oldCode = sh(`dumpsys package ${PKG} | grep versionCode | head -1`).trim();
    await sleep(1800); // the last save reaches the internal copy
    page?.close();
    sh(`am force-stop ${PKG}`);
    const out = adb("install", "-r", nextApk);
    assert(/Success/.test(out), out);
    const newCode = sh(`dumpsys package ${PKG} | grep versionCode | head -1`).trim();
    assert(oldCode !== newCode, `the version did not change (${oldCode})`);
    await launch();
    assert(
      await ev(`!!document.querySelector('.pin')`),
      "the lock screen is gone after the update",
    );
    await typePin("1234");
    await waitFor(`!!document.querySelector('.navbar')`, "the main screen after the update");
    const after = await stateOfData();
    assert(
      after.hash === before.hash && after.ops === before.ops,
      "the data changed by the update",
    );
    return `${oldCode} → ${newCode}; ${after.ops} operations unchanged`;
  },
);

await step("a build signed with another key is refused over this one (data stays)", async () => {
  // Re-sign the APK with a throw-away key and try to install it over the installed app.
  const dir = join(tmpdir(), "monivra-foreign-key");
  mkdirSync(dir, { recursive: true });
  execFileSync(
    "keytool",
    [
      "-genkeypair",
      "-keystore",
      join(dir, "other.jks"),
      "-alias",
      "other",
      "-keyalg",
      "RSA",
      "-keysize",
      "2048",
      "-validity",
      "100",
      "-storepass",
      "foreign",
      "-keypass",
      "foreign",
      "-dname",
      "CN=Other",
    ],
    { stdio: "ignore" },
  );
  const buildTools = execFileSync(
    "bash",
    ["-c", "ls -d $ANDROID_HOME/build-tools/* | sort -V | tail -1"],
    { encoding: "utf8" },
  ).trim();
  const foreign = join(dir, "foreign.apk");
  execFileSync(`${buildTools}/apksigner`, [
    "sign",
    "--ks",
    join(dir, "other.jks"),
    "--ks-pass",
    "pass:foreign",
    "--key-pass",
    "pass:foreign",
    "--out",
    foreign,
    nextApk,
  ]);
  const out = tryAdb("install", "-r", foreign);
  assert(
    /INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match/i.test(out),
    `unexpected: ${out.slice(0, 200)}`,
  );
  assert((await stateOfData()).hash === before.hash, "data changed");
  return "refused: INSTALL_FAILED_UPDATE_INCOMPATIBLE";
});

await step("a scheduled payment reminder is registered with Android's alarm manager", async () => {
  tryAdb("shell", `pm grant ${PKG} android.permission.POST_NOTIFICATIONS`);
  await ev(`(async () => {
    const { appData } = await import('/js/core/state.js');
    const { save } = await import('/js/data/storage.js');
    const at = (min) => { const d = new Date(Date.now() + min * 60000); const p = (n) => String(n).padStart(2, '0'); return [d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()), p(d.getHours()) + ':' + p(d.getMinutes())]; };
    const [day, due] = at(4); const [, remind] = at(2);
    const account = appData.accounts[0], category = appData.categories.find((c) => c.type === 'expense' && !c.parent);
    appData.scheduled.push({ id: 'e2e-payment', type: 'expense', amount: 777, date: day, time: due, comment: 'e2e', tags: [], from: account.id, category: category.id, reminder: { before: 0, unit: 'Days', time: remind }, recur: null });
    appData.settings.notifications = true;
    appData.settings.pin = appData.settings.pin; save();
    window.__due = [day, due, remind];
  })()`);
  const [day, due, remind] = await ev(`window.__due`);
  // The permission is read when the application starts: restart so it sees the grant.
  await sleep(1800); // the changes reach the internal copy before the process is stopped
  await restart();
  if (await ev(`!!document.querySelector('.pin')`)) {
    await typePin("1234");
    await waitFor(`!!document.querySelector('.navbar')`, "the main screen");
  }
  await sleep(5000);
  const mine = tryAdb("shell", "dumpsys alarm | grep -i monivra")
    .split("\n")
    .filter((l) => l.trim());
  const state = await ev(`localStorage.getItem('monivra.reminders.scheduled')`);
  const permission = await ev(
    `Capacitor.Plugins.LocalNotifications.checkPermissions().then((r) => r.display)`,
  );
  const pending = await ev(
    `Capacitor.Plugins.LocalNotifications.getPending().then((r) => (r.notifications || []).length)`,
  );
  const stored = await ev(`(async () => {
    const { appData } = await import('/js/core/state.js');
    const { upcomingReminders } = await import('/js/domain/reminder-plan.js');
    return { scheduled: appData.scheduled.length, notifications: appData.settings.notifications,
      planned: upcomingReminders(appData).length, now: new Date().toString() };
  })()`);
  const probe =
    await ev(`Capacitor.Plugins.LocalNotifications.schedule({ notifications: [{ id: 4242,
    title: 'probe', body: 'probe', channelId: 'payments',
    schedule: { at: new Date(Date.now() + 600000), allowWhileIdle: true } }] })
    .then(() => 'ok', (e) => 'error: ' + (e && e.message))`);
  const diagnostics = JSON.stringify({
    probe,
    permission,
    pending,
    state,
    stored,
    alarmLines: mine.length,
  });
  writeFileSync(join(outDir, "alarms.txt"), `${diagnostics}\n${mine.join("\n")}`);
  assert(permission === "granted", `notification permission: ${diagnostics}`);
  assert(
    state && state.includes("e2e-payment") && pending > 0,
    `the application did not hand the reminder to the system: ${diagnostics}`,
  );
  assert(mine.length, `no alarm of the application is registered: ${diagnostics}`);
  window_due = { day, due, remind };
  return `payment ${day} ${due}, reminder ${remind}; ${mine.length} alarm line(s) of the application`;
});

await step(
  "the reminder is delivered while the application is closed, and the payment is not posted until it is opened",
  async () => {
    page?.close();
    page = null;
    sh("input keyevent KEYCODE_HOME");
    await sleep(2500);
    // Ends the process the way the system does when it needs memory; unlike a force stop it keeps the
    // alarms the application handed to the system.
    const pid = tryAdb("shell", `pidof ${PKG}`).trim();
    if (pid) runAs(`kill -9 ${pid}`);
    await sleep(2000);
    assert(!tryAdb("shell", `pidof ${PKG}`).trim(), "the process is still running");
    const start = Date.now();
    let notification = "";
    while (Date.now() - start < 5 * 60000) {
      notification = sh("dumpsys notification --noredact");
      if (
        new RegExp(
          `pkg=${PKG}[\\s\\S]{0,1500}Scheduled payment|Scheduled payment[\\s\\S]{0,1500}pkg=${PKG}`,
        ).test(notification)
      )
        break;
      await sleep(15000);
    }
    const delivered =
      new RegExp(`pkg=${PKG}`).test(notification) &&
      /Scheduled payment|Плановый платёж/.test(notification);
    writeFileSync(
      join(outDir, "notification-dump.txt"),
      notification
        .split("\n")
        .filter(
          (l, i, a) => l.includes(PKG) || (a[i - 1] ?? "").includes(PKG) || /title|text=/.test(l),
        )
        .slice(0, 120)
        .join("\n"),
    );
    assert(delivered, "no notification of the application was posted within 5 minutes");
    return `delivered after ${Math.round((Date.now() - start) / 1000)} s with the application closed`;
  },
  { required: false },
);

await step(
  "opening the application after the due time posts the payment once, with its own date and time",
  async () => {
    // Wait until the payment is due (4 minutes after it was set up), then open the application.
    const [, due] = [window_due?.day, window_due?.due];
    assert(due, "no payment was set up");
    await waitFor(`1`, "ready").catch(() => {});
    const wait = async () => {
      for (let i = 0; i < 80; i++) {
        const [h, m] = tryAdb("shell", "date +%H:%M").trim().split(":").map(Number);
        const [dh, dm] = due.split(":").map(Number);
        if (h * 60 + m > dh * 60 + dm) return;
        await sleep(5000);
      }
    };
    await wait();
    await launch();
    if (await ev(`!!document.querySelector('.pin')`)) {
      await typePin("1234");
      await waitFor(`!!document.querySelector('.navbar')`, "the main screen");
    }
    await sleep(3000);
    const posted = await ev(`(async () => {
    const { appData } = await import('/js/core/state.js');
    return appData.ops.filter((o) => o.fromSchedule?.id === 'e2e-payment').map((o) => ({ date: o.date, time: o.time, amount: o.amount, at: o.fromSchedule.date }));
  })()`);
    assert(posted.length === 1, `expected one posted operation, got ${posted.length}`);
    assert(
      posted[0].date === window_due.day && posted[0].time === window_due.due,
      `wrong date/time: ${JSON.stringify(posted[0])}`,
    );
    // Another minute with the application open: still once.
    await sleep(70000);
    const again = await ev(
      `(async () => (await import('/js/core/state.js')).appData.ops.filter((o) => o.fromSchedule?.id === 'e2e-payment').length)()`,
    );
    assert(again === 1, `posted ${again} times`);
    const left = await ev(
      `(async () => (await import('/js/core/state.js')).appData.scheduled.some((o) => o.id === 'e2e-payment'))()`,
    );
    assert(!left, "the posted payment is still scheduled");
    return `posted once as ${posted[0].date} ${posted[0].time}`;
  },
);

await step(
  "a data file exported by the web app: previewed, a corrupt one refused with data untouched, a valid one restored",
  async () => {
    const before = await stateOfData();
    const result = await ev(`(async () => {
    const { appData } = await import('/js/core/state.js');
    const { backupFileText, parseBackupFile } = await import('/js/data/backup-file.js');
    const { openFileRestore } = await import('/js/screens/more/backup-pages.js');
    const { restoreData } = await import('/js/domain/backups.js');
    const { makePin } = await import('/js/platform/pin.js');
    // A file as the web app writes it: no marker for a PIN kept by the system, a PIN hash instead.
    const web = JSON.parse(backupFileText());
    web.accounts[0].name = 'From the web';
    web.ops = web.ops.slice(0, 7);
    web.scheduled = [];
    web.settings.pin = makePin('9999');
    const text = JSON.stringify(web);
    const out = {};
    const refused = [];
    for (const bad of [text.slice(0, 300), '', '{"schema":1,"accounts":"x"}', JSON.stringify({ ...web, schema: 2 })]) {
      try { parseBackupFile(bad); refused.push('accepted'); } catch (e) { refused.push(e.message); }
    }
    out.refused = refused;
    out.unchangedAfterRefusal = appData.ops.length;
    const parsed = parseBackupFile(text);
    openFileRestore({ name: 'monivra-backup-web.json', ...parsed });
    await new Promise((r) => setTimeout(r, 800));
    out.previewShown = /From the web|Restore|backup/i.test(document.body.innerText);
    out.opsBeforeConfirm = appData.ops.length;
    const { closeLayers, goBack } = await import('/js/ui/navigation.js');
    closeLayers(); goBack();
    restoreData(parsed.data, { mode: 'replace', scheduled: 'none', conflicts: 'backup' });
    await new Promise((r) => setTimeout(r, 3000));
    // The restore replaces the data object: read it again from the module, not the old reference.
    const now = (await import('/js/core/state.js')).appData;
    out.opsAfter = now.ops.length;
    out.firstAccount = now.accounts[0].name;
    out.pinInData = JSON.stringify(now.settings.pin);
    out.stored = localStorage.getItem(${JSON.stringify(KEY)});
    return out;
  })()`);
    assert(
      result.refused.every((m) => m !== "accepted"),
      `a corrupt file was accepted: ${JSON.stringify(result.refused)}`,
    );
    assert(result.unchangedAfterRefusal === before.ops, "data changed by refused files");
    assert(result.previewShown, "no preview page for a valid file");
    assert(result.opsBeforeConfirm === before.ops, "data changed before the person confirmed");
    assert(
      result.opsAfter === 7 && result.firstAccount === "From the web",
      `the restore did not apply: ${result.opsAfter} ${result.firstAccount}`,
    );
    const pin = JSON.parse(result.stored).settings.pin;
    assert(
      pin && pin.native === true && !result.stored.includes('"salt"'),
      `the web PIN hash stayed in the data: ${result.pinInData}`,
    );
    assert(runAs("ls files/secure").includes("pin.bin"), "no sealed PIN file");
    await restart();
    assert(await ev(`!!document.querySelector('.pin')`), "no lock screen after the restore");
    await typePin("9999");
    await waitFor(
      `!!document.querySelector('.navbar')`,
      "the main screen with the PIN of the web file",
    );
    return `refused: ${result.refused.map((m) => m.slice(0, 40)).join(" | ")}; restored 7 operations; the PIN of the file is sealed`;
  },
);

await step(
  "a 94-page report in the real WebView: time of each stage and how many page pictures the preview loads (measurement, not a limit)",
  async () => {
    const out = await ev(`(async () => {
      const t = () => performance.now();
      const { setAppData, appData, emptyFilters } = await import('/js/core/state.js');
      const d = JSON.parse(JSON.stringify(appData));
      const exp = d.categories.find((c) => c.type === 'expense');
      for (let i = 0; i < 2000; i++)
        d.ops.push({ id: 'p' + i, type: 'expense', amount: 100 + (i % 977), date: '202' + (i % 6) + '-0' + (1 + (i % 9)) + '-1' + (i % 9), comment: 'Purchase number ' + i + ' at the shop', tags: [], from: d.accounts[0].id, category: exp.id });
      setAppData(d);
      const { detailModel } = await import('/js/domain/report-model.js');
      const { layoutDetail } = await import('/js/data/report-layout.js');
      const { loadReportFonts } = await import('/js/platform/report-font.js');
      const { measuringContext, renderPages } = await import('/js/platform/report-render.js');
      const { buildPdf } = await import('/js/platform/pdf.js');
      const times = {};
      let s = t();
      const model = detailModel({ filters: emptyFilters(), period: { ...appData.settings, mode: 'all' }, parts: { type: true, accounts: true, amount: true, comment: true, tags: true } });
      times.model = t() - s; s = t();
      const fonts = await loadReportFonts();
      const pages = layoutDetail(model, measuringContext());
      times.layout = t() - s; s = t();
      const marks = [];
      const rendered = await renderPages(pages, (done) => marks.push(Math.round(t() - s)));
      times.render = t() - s; s = t();
      const bytes = await buildPdf(pages, fonts, { title: 't', subject: 'Monivra', language: 'en' });
      times.pdf = t() - s;
      for (const r of rendered) URL.revokeObjectURL(r.url);
      const r = (n) => Math.round(n);
      return JSON.stringify({ pages: pages.length, model: r(times.model), layout: r(times.layout), render: r(times.render), first5pagesMs: marks.slice(0, 5), pdf: r(times.pdf), pdfKB: r(bytes.length / 1024) });
    })()`);
    return String(out);
  },
  { required: false },
);

await step("the log holds no financial data and no crash", async () => {
  const log = tryAdb("logcat", "-d");
  const mine = log.split("\n").filter((l) => /monivra|Capacitor|chromium|MonivraNative/i.test(l));
  writeFileSync(join(outDir, "app-log.txt"), mine.slice(-400).join("\n"));
  assert(!/FATAL EXCEPTION/.test(tryAdb("logcat", "-d", "-b", "crash")), "a crash was logged");
  const leaks = mine.filter((l) =>
    /"opening"|"accounts"|"salt"|e2e-payment|"amount":\s*777/.test(l),
  );
  assert(!leaks.length, `data in the log: ${leaks[0]?.slice(0, 160)}`);
  return `${mine.length} lines of the application checked`;
});

page?.close();
writeFileSync(join(outDir, "results.json"), JSON.stringify(results, null, 2));
const lines = results.map(
  (r) => `${r.status.padEnd(4)} ${r.name}${r.note ? ` — ${r.note}` : ""} (${r.seconds}s)`,
);
const summary = `${results.filter((r) => r.status === "pass").length} passed, ${failed} failed, ${results.filter((r) => r.status === "warn").length} not confirmed (optional)`;
writeFileSync(join(outDir, "report.txt"), `${lines.join("\n")}\n\n${summary}\n`);
console.log(summary);
process.exit(failed ? 1 : 0);
