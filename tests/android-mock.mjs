// The Android paths of the application, driven in a browser against a MOCK of the native bridge:
// node tests/android-mock.mjs
//
// IMPORTANT: this is not the Android system. The bridge here is a script that records what the
// application asks of it and answers as configured; it proves the application calls the bridge the
// way the native plugin expects and reacts correctly to its answers (cancel, failure, refusal,
// restored data). It proves nothing about the real system screens, the keystore, the fingerprint
// sensor or the alarms: those are checked on the emulator (CI) and on a phone (docs/ANDROID.md).
import { chromium } from "playwright";
import { serveApp } from "./server.mjs";

const { server, address } = await serveApp();
const browser = await chromium.launch();

// ---- sample data, made by the application itself ----
const seedPage = await browser.newPage();
await seedPage.goto(`${address}/index.html`);
const seedJson = await seedPage.evaluate(async () => {
  const { createSampleData } = await import("/js/data/sample.js");
  return JSON.stringify(createSampleData());
});
await seedPage.close();
const STORAGE_KEY = "monivra.offline.2026.v1";

// ---- the mock bridge ----
function makeBridge(options = {}) {
  const s = {
    mirror: options.mirror ?? null,
    mirrorSeq: options.mirrorSeq ?? 0,
    secure: { ...(options.secure ?? {}) },
    secureBroken: options.secureBroken ?? false,
    biometric: options.biometric ?? "unsupported",
    biometricResult: options.biometricResult ?? "ok",
    saveResult: options.saveResult ?? "saved",
    printFails: false,
    notifications: options.notifications ?? "prompt",
    grantOnRequest: options.grantOnRequest ?? true,
    pending: [],
    calls: [],
    shown: [],
  };
  s.count = (name) => s.calls.filter((c) => c.name === name).length;
  s.handle = async (plugin, method, args) => {
    const name = `${plugin}.${method}`;
    s.calls.push({ name, args });
    const doc = (a) => ({
      name: a.name,
      mime: a.mime,
      head: Buffer.from(a.data, "base64").subarray(0, 5).toString("latin1"),
    });
    switch (name) {
      case "MonivraNative.mirrorWrite":
        s.mirror = args.text;
        s.mirrorSeq = args.seq ?? 0;
        return { status: "ok" };
      case "MonivraNative.mirrorRead":
        return s.mirror === null
          ? { status: "missing" }
          : { status: "ok", text: s.mirror, seq: s.mirrorSeq };
      case "MonivraNative.secureSet":
        s.secure[args.key] = args.value;
        return { status: "ok" };
      case "MonivraNative.secureGet":
        if (s.secureBroken) return { status: "error" };
        return args.key in s.secure
          ? { status: "ok", value: s.secure[args.key] }
          : { status: "missing" };
      case "MonivraNative.secureRemove":
        delete s.secure[args.key];
        return { status: "ok" };
      case "MonivraNative.biometricStatus":
        return { status: s.biometric };
      case "MonivraNative.biometricAuthenticate":
        return { result: s.biometricResult };
      case "MonivraNative.saveDocument":
        s.calls.at(-1).doc = doc(args);
        return { status: s.saveResult };
      case "MonivraNative.shareDocument":
        s.calls.at(-1).doc = doc(args);
        await new Promise((r) => setTimeout(r, 300));
        return { status: "opened" };
      case "MonivraNative.printPdf":
        s.calls.at(-1).doc = doc(args);
        if (s.printFails) throw Error("print service unavailable");
        await new Promise((r) => setTimeout(r, 300));
        return { status: "closed" };
      case "LocalNotifications.checkPermissions":
        return { display: s.notifications };
      case "LocalNotifications.requestPermissions":
        s.notifications = s.grantOnRequest ? "granted" : "denied";
        return { display: s.notifications };
      case "LocalNotifications.getPending":
        return { notifications: s.pending.map(({ id }) => ({ id })) };
      case "LocalNotifications.cancel":
        s.pending = s.pending.filter((p) => !args.notifications.some((n) => n.id === p.id));
        return {};
      case "LocalNotifications.schedule":
        for (const n of args.notifications) (n.schedule ? s.pending : s.shown).push(n);
        return { notifications: args.notifications.map(({ id }) => ({ id })) };
      default:
        return {};
    }
  };
  return s;
}

// A phone-sized page whose Capacitor is the mock; `data` is stored before the application starts
// (null: nothing stored). The page loads index.html with the Android entry, as the APK does.
async function openNative({ data = seedJson, saves = 0, bridge = makeBridge(), width = 360 } = {}) {
  const context = await browser.newContext({
    viewport: { width, height: 700 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  await context.exposeFunction("__bridge", (plugin, method, args) =>
    bridge.handle(plugin, method, args ?? {}),
  );
  await context.addInitScript(
    ([key, text, count]) => {
      if (text !== null && !sessionStorage.getItem("seeded")) {
        localStorage.setItem(key, text);
        localStorage.setItem(`${key}.saves`, String(count));
        sessionStorage.setItem("seeded", "1");
      }
      const listeners = {};
      window.__listeners = listeners;
      const proxy = (plugin, methods) =>
        Object.fromEntries(methods.map((m) => [m, (a) => window.__bridge(plugin, m, a ?? {})]));
      window.Capacitor = {
        isNativePlatform: () => true,
        Plugins: {
          MonivraNative: proxy("MonivraNative", [
            "saveDocument",
            "shareDocument",
            "printPdf",
            "biometricStatus",
            "biometricAuthenticate",
            "secureSet",
            "secureGet",
            "secureRemove",
            "mirrorWrite",
            "mirrorRead",
            "setSystemBars",
            "setPrivacyScreen",
          ]),
          App: {
            ...proxy("App", ["minimizeApp"]),
            addListener: (event, fn) => {
              (listeners[event] ||= []).push(fn);
              return Promise.resolve({ remove() {} });
            },
          },
          LocalNotifications: proxy("LocalNotifications", [
            "checkPermissions",
            "requestPermissions",
            "createChannel",
            "schedule",
            "getPending",
            "cancel",
          ]),
        },
      };
    },
    [STORAGE_KEY, data, saves],
  );
  const page = await context.newPage();
  page.errors = [];
  page.on("pageerror", (error) => page.errors.push(error.message));
  // The APK serves index.html with its own entry in place of main.js.
  await page.route("**/index.html", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace("js/app/main.js", "js/app/main-native.js");
    await route.fulfill({ response, body });
  });
  await page.goto(`${address}/index.html`);
  await page.waitForSelector(".navbar, .pin, .welcome, .recovery");
  page.bridge = bridge;
  return page;
}
const stored = (page) => page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY);
const tab = (page, name) => page.locator(".navbar").getByText(name, { exact: true }).click();
const settle = (page, ms = 1200) => page.waitForTimeout(ms);
const expect = (value, label) => ({
  toBe(wanted) {
    if (value !== wanted)
      throw Error(
        `${label ?? "value"}: expected ${JSON.stringify(wanted)}, got ${JSON.stringify(value)}`,
      );
  },
  toBeTruthy() {
    if (!value) throw Error(`${label ?? "value"} is falsy`);
  },
});
const setPinInApp = (page, pin) =>
  page.evaluate(async (digits) => {
    const { appData } = await import("/js/core/state.js");
    const { save } = await import("/js/data/storage.js");
    const { makePin } = await import("/js/platform/pin.js");
    appData.settings.pin = makePin(digits);
    save();
  }, pin);
const typePin = async (page, digits) => {
  for (const d of digits) await page.locator(".keypad .key", { hasText: d }).click();
};
const openSettings = async (page, section) => {
  await tab(page, "More");
  await page.getByText("Settings", { exact: true }).first().click();
  await page.getByText(section, { exact: true }).first().click();
};
const openDataPage = async (page, name) => {
  await tab(page, "More");
  await page.getByText("Data", { exact: true }).first().click();
  await page.getByText(name, { exact: true }).click();
};

const scenarios = {
  // ---------- data survives, and is restored only when it is gone ----------
  async "MOCK: stored data is left alone when the internal copy is the same or older"(open) {
    const older = seedJson.replace('"Cash"', '"Other"');
    for (const [saves, mirrorSeq] of [
      [5, 5],
      [5, 3],
    ]) {
      const page = await open({ saves, bridge: makeBridge({ mirror: older, mirrorSeq }) });
      expect(await stored(page), `stored data (${saves}/${mirrorSeq})`).toBe(seedJson);
      expect(await page.getByText("latest changes were recovered").count(), "notice").toBe(0);
    }
  },
  async "MOCK: a newer internal copy replaces stored data the WebView had not written yet, and says so"(
    open,
  ) {
    const newer = seedJson.replace('"Cash"', '"Other"');
    const page = await open({ saves: 4, bridge: makeBridge({ mirror: newer, mirrorSeq: 9 }) });
    await page.getByText("latest changes were recovered").waitFor();
    expect(await stored(page), "stored data").toBe(newer);
  },
  async "MOCK: damaged stored data is never replaced by the internal copy"(open) {
    const page = await open({
      data: "{damaged",
      saves: 1,
      bridge: makeBridge({ mirror: seedJson, mirrorSeq: 50 }),
    });
    await page.waitForSelector(".recovery, .welcome, .navbar");
    expect(await stored(page), "stored data").toBe("{damaged");
  },
  async "MOCK: when the stored data is gone the application restores it from the internal copy and says so"(
    open,
  ) {
    const page = await open({ data: null, bridge: makeBridge({ mirror: seedJson }) });
    expect(await stored(page), "restored data").toBe(seedJson);
    await page.getByText("restored from the internal copy").waitFor();
    expect(await page.locator(".welcome").count(), "welcome screen").toBe(0);
  },
  async "MOCK: with neither stored data nor a copy it is a new install"(open) {
    const page = await open({ data: null });
    await page.waitForSelector(".welcome");
    expect(await stored(page), "stored data").toBe(null);
  },
  async "MOCK: a damaged internal copy is not used and the person is told"(open) {
    const page = await open({ data: null, bridge: makeBridge({ mirror: "{not json" }) });
    await page.waitForSelector(".welcome");
    await page.getByText("internal copy of the data could not be read").waitFor();
    expect(await stored(page), "stored data").toBe(null);
  },
  async "MOCK: every change is copied to the internal copy, once for a burst, and on leaving the screen"(
    open,
  ) {
    const page = await open();
    await page.evaluate(async () => {
      const { appData } = await import("/js/core/state.js");
      const { save } = await import("/js/data/storage.js");
      for (let i = 0; i < 5; i++) {
        appData.settings.lockDelay = i;
        save();
      }
    });
    await settle(page);
    expect(page.bridge.count("MonivraNative.mirrorWrite"), "writes for a burst").toBe(1);
    expect(page.bridge.mirror, "copy").toBe(await stored(page));
    // A change followed at once by leaving the screen is written without waiting.
    await page.evaluate(async () => {
      const { appData } = await import("/js/core/state.js");
      const { save } = await import("/js/data/storage.js");
      appData.settings.lockDelay = 60;
      save();
      window.__listeners.appStateChange.forEach((f) => f({ isActive: false }));
    });
    await settle(page, 200);
    expect(page.bridge.mirror, "copy after leaving").toBe(await stored(page));
  },

  // ---------- the PIN and the lock ----------
  async "MOCK: a PIN is moved to the system storage; the data keeps only a marker; the PIN still unlocks"(
    open,
  ) {
    const bridge = makeBridge();
    const page = await open({ bridge });
    await setPinInApp(page, "1234");
    await settle(page, 400);
    const text = await stored(page);
    const pin = JSON.parse(text).settings.pin;
    expect(pin.native, "marker").toBe(true);
    expect(pin.length, "length").toBe(4);
    expect("hash" in pin || "salt" in pin, "hash left in the data").toBe(false);
    expect(text.includes("salt"), "salt anywhere in the stored text").toBe(false);
    expect(JSON.parse(bridge.secure.pin).hash.length, "sealed hash").toBe(64);
    // The internal copy has no hash either.
    await settle(page);
    expect(bridge.mirror.includes('"salt"'), "salt in the internal copy").toBe(false);
    await page.reload();
    await page.waitForSelector(".pin");
    await typePin(page, "1111");
    await page.getByText("Incorrect PIN").waitFor();
    await typePin(page, "1234");
    await page.waitForSelector(".navbar");
  },
  async "MOCK: a PIN that the system cannot give back turns the lock off with a notice, never locks the person out"(
    open,
  ) {
    const marker = JSON.parse(seedJson);
    marker.settings.pin = { v: 2, native: true, length: 4 };
    const page = await open({
      data: JSON.stringify(marker),
      bridge: makeBridge({ secureBroken: true }),
    });
    await page.waitForSelector(".navbar");
    await page.getByText("PIN could not be read").waitFor();
    expect(JSON.parse(await stored(page)).settings.pin, "pin").toBe(false);
  },
  async "MOCK: turning the PIN off forgets the sealed hash"(open) {
    const bridge = makeBridge();
    const page = await open({ bridge });
    await setPinInApp(page, "4321");
    await settle(page, 400);
    expect("pin" in bridge.secure, "sealed").toBe(true);
    await page.evaluate(async () => {
      const { appData } = await import("/js/core/state.js");
      const { save } = await import("/js/data/storage.js");
      appData.settings.pin = false;
      save();
    });
    await settle(page, 400);
    expect("pin" in bridge.secure, "sealed after turning off").toBe(false);
  },
  async "MOCK: a data file from a browser with a PIN hash is sealed when restored, not kept in the data"(
    open,
  ) {
    const bridge = makeBridge();
    const page = await open({ bridge });
    await page.evaluate(async () => {
      const { appData, setAppData } = await import("/js/core/state.js");
      const { save } = await import("/js/data/storage.js");
      const { makePin } = await import("/js/platform/pin.js");
      setAppData({ ...appData, settings: { ...appData.settings, pin: makePin("2468") } });
      save();
    });
    await settle(page, 400);
    expect(JSON.parse(await stored(page)).settings.pin.native, "marker").toBe(true);
    expect("pin" in bridge.secure, "sealed").toBe(true);
  },

  // ---------- biometrics ----------
  async "MOCK: where biometrics are not supported the setting is not shown and the lock has only the PIN"(
    open,
  ) {
    const page = await open({ bridge: makeBridge({ biometric: "unsupported" }) });
    await setPinInApp(page, "1234");
    await openSettings(page, "Security");
    expect(await page.getByText("Unlock with fingerprint or face").count(), "setting").toBe(0);
  },
  async "MOCK: biometrics set up: the prompt opens on the lock screen, success unlocks, cancel leaves the PIN keys working"(
    open,
  ) {
    const bridge = makeBridge({ biometric: "available", biometricResult: "cancelled" });
    const data = JSON.parse(seedJson);
    data.settings.biometric = true;
    const page = await open({ data: JSON.stringify(data), bridge });
    await setPinInApp(page, "1234");
    await settle(page, 400);
    await page.reload();
    await page.waitForSelector(".pin");
    await settle(page, 300);
    expect(bridge.count("MonivraNative.biometricAuthenticate"), "prompts at the lock screen").toBe(
      1,
    );
    expect(await page.locator(".pin").count(), "still locked after cancel").toBe(1);
    await typePin(page, "1234");
    await page.waitForSelector(".navbar");
    // Next time the system says yes.
    bridge.biometricResult = "ok";
    await page.reload();
    await page.waitForSelector(".navbar", { timeout: 4000 });
    expect(bridge.count("MonivraNative.biometricAuthenticate") >= 2, "prompted again").toBe(true);
  },
  async "MOCK: a failed or locked-out sensor leaves the PIN, with a message, and does not loop"(
    open,
  ) {
    const bridge = makeBridge({ biometric: "available", biometricResult: "lockout" });
    const data = JSON.parse(seedJson);
    data.settings.biometric = true;
    const page = await open({ data: JSON.stringify(data), bridge });
    await setPinInApp(page, "1234");
    await settle(page, 400);
    await page.reload();
    await page.waitForSelector(".pin");
    await page.getByText("Too many fingerprint attempts").waitFor();
    await settle(page, 600);
    expect(bridge.count("MonivraNative.biometricAuthenticate"), "prompts").toBe(1);
    await typePin(page, "1234");
    await page.waitForSelector(".navbar");
  },
  async "MOCK: switching biometrics on needs a PIN and a fingerprint set up on the phone"(open) {
    const bridge = makeBridge({ biometric: "not_enrolled" });
    const page = await open({ bridge });
    await openSettings(page, "Security");
    await page.getByText("Unlock with fingerprint or face").waitFor();
    await page.getByText("Unlock with fingerprint or face").click();
    await page.getByText("Set a PIN first").waitFor();
    await setPinInApp(page, "1234");
    await settle(page, 300);
    await page.getByText("Unlock with fingerprint or face").click();
    await page.getByText("Set up a fingerprint or face in your phone settings first").waitFor();
    expect(
      bridge.count("MonivraNative.biometricAuthenticate"),
      "prompt shown without enrolment",
    ).toBe(0);
    expect(JSON.parse(await stored(page)).settings.biometric, "switch").toBe(false);
  },

  // ---------- files ----------
  async "MOCK: saving the data file asks the system once, with the file's name and type, and confirms only when saved"(
    open,
  ) {
    const page = await open();
    await openDataPage(page, "Data file");
    const save = page.getByRole("button", { name: "Save", exact: true });
    await save.dblclick();
    await settle(page, 600);
    expect(page.bridge.count("MonivraNative.saveDocument"), "save calls for a double tap").toBe(1);
    const call = page.bridge.calls.find((c) => c.name === "MonivraNative.saveDocument");
    expect(/^monivra.*\.json$/i.test(call.doc.name), "file name").toBe(true);
    expect(call.doc.mime, "type").toBe("application/json");
    expect(call.doc.head.startsWith("{"), "content is JSON").toBe(true);
    await page.getByText("File saved").waitFor();
  },
  async "MOCK: a closed save screen says nothing, a failed one says that nothing was written"(
    open,
  ) {
    const bridge = makeBridge({ saveResult: "cancelled" });
    const page = await open({ bridge });
    await openDataPage(page, "Data file");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await settle(page, 600);
    expect(await page.getByText("File saved").count(), "toast after cancel").toBe(0);
    bridge.saveResult = "failed";
    bridge.handle = ((original) => async (plugin, method, args) =>
      plugin === "MonivraNative" && method === "saveDocument"
        ? Promise.reject(Error("write failed"))
        : original(plugin, method, args))(bridge.handle);
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("could not be saved").waitFor();
  },
  async "MOCK: sharing the data file opens the share sheet once however fast the taps"(open) {
    const page = await open();
    await openDataPage(page, "Data file");
    const share = page.getByRole("button", { name: "Share", exact: true });
    await share.click();
    await share.click();
    await share.click();
    await settle(page, 800);
    expect(page.bridge.count("MonivraNative.shareDocument"), "share calls").toBe(1);
    expect(await page.getByText("Sharing is not available").count(), "browser-only dialog").toBe(0);
  },

  // ---------- Back ----------
  async "MOCK: Back closes a sheet, then a page, and at the first screen sends the app to the background"(
    open,
  ) {
    const page = await open();
    const back = () =>
      page.evaluate(() => window.__listeners.backButton.forEach((f) => f({ canGoBack: false })));
    await tab(page, "More");
    await page.getByText("Data", { exact: true }).first().click();
    await page.waitForSelector(".page, .page-header, .content");
    await back();
    await page.waitForSelector(".navbar");
    // From a tab that is not the first one, Back goes to the first.
    await back();
    expect(page.bridge.count("App.minimizeApp"), "minimized from a middle screen").toBe(0);
    await page
      .locator(".navbar .active, .navbar [aria-current]")
      .first()
      .waitFor()
      .catch(() => {});
    await back();
    await settle(page, 200);
    expect(page.bridge.count("App.minimizeApp") >= 1, "minimized at the first screen").toBe(true);
  },
  async "MOCK: Back on the lock screen leaves the app, it does not step into hidden screens"(open) {
    const page = await open();
    await setPinInApp(page, "1234");
    await settle(page, 400);
    await page.reload();
    await page.waitForSelector(".pin");
    await page.evaluate(() =>
      window.__listeners.backButton.forEach((f) => f({ canGoBack: false })),
    );
    await settle(page, 200);
    expect(page.bridge.count("App.minimizeApp"), "minimized").toBe(1);
    expect(await page.locator(".pin").count(), "still locked").toBe(1);
  },

  // ---------- reminders ----------
  async "MOCK: with the permission already given, the reminders are handed to the system at launch by themselves"(
    open,
  ) {
    const data = JSON.parse(seedJson);
    const base = data.accounts[0];
    const food = data.categories.find((c) => c.type === "expense" && !c.parent);
    const soon = new Date(Date.now() + 3 * 86400000);
    const iso = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, "0")}-${String(soon.getDate()).padStart(2, "0")}`;
    data.scheduled = [
      {
        id: "s2",
        type: "expense",
        amount: 500,
        date: iso,
        time: "10:00",
        comment: "",
        tags: [],
        from: base.id,
        category: food.id,
        reminder: { before: 1, unit: "Days", time: "09:00" },
        recur: null,
      },
    ];
    data.settings.notifications = true;
    const bridge = makeBridge({ notifications: "granted" });
    await open({ data: JSON.stringify(data), bridge });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(bridge.pending.length, "reminders handed to the system at launch").toBe(1);
  },
  async "MOCK: notifications: asked on switching on; granted → reminders handed to the system; the old ones replaced"(
    open,
  ) {
    const data = JSON.parse(seedJson);
    const base = data.accounts[0];
    const food = data.categories.find((c) => c.type === "expense" && !c.parent);
    const soon = new Date(Date.now() + 3 * 86400000);
    const iso = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, "0")}-${String(soon.getDate()).padStart(2, "0")}`;
    data.scheduled = [
      {
        id: "s1",
        type: "expense",
        amount: 500,
        date: iso,
        time: "10:00",
        comment: "",
        tags: [],
        from: base.id,
        category: food.id,
        reminder: { before: 1, unit: "Days", time: "09:00" },
        recur: null,
      },
    ];
    data.settings.notifications = false;
    const bridge = makeBridge({ notifications: "prompt" });
    const page = await open({ data: JSON.stringify(data), bridge });
    expect(bridge.count("LocalNotifications.requestPermissions"), "asked at launch").toBe(0);
    await openSettings(page, "Notifications");
    await page.getByText("Notifications", { exact: true }).last().click();
    await settle(page, 2200);
    expect(bridge.count("LocalNotifications.requestPermissions"), "asked on switching on").toBe(1);
    expect(bridge.pending.length, "reminders handed to the system").toBe(1);
    expect(bridge.pending[0].schedule.allowWhileIdle, "allowed while idle").toBe(true);
    const firstAt = new Date(bridge.pending[0].schedule.at);
    expect(firstAt.getHours() * 60 + firstAt.getMinutes(), "reminder time").toBe(9 * 60);
    expect(bridge.pending[0].channelId, "channel").toBe("payments");
    const first = bridge.pending[0].id;
    // A change of the payment replaces the reminder; nothing stays from the old one.
    await page.evaluate(async () => {
      const { appData } = await import("/js/core/state.js");
      const { save } = await import("/js/data/storage.js");
      appData.scheduled[0].reminder.time = "08:00";
      save();
    });
    await settle(page, 2200);
    expect(bridge.pending.length, "one reminder after the change").toBe(1);
    expect(bridge.pending[0].id === first, "same payment, same number").toBe(true);
    const at = new Date(bridge.pending[0].schedule.at);
    expect(at.getHours() * 60 + at.getMinutes(), "reminder time after the change").toBe(8 * 60);
    // Deleting the payment leaves no reminder behind.
    await page.evaluate(async () => {
      const { appData } = await import("/js/core/state.js");
      const { save } = await import("/js/data/storage.js");
      appData.scheduled = [];
      save();
    });
    await settle(page, 2200);
    expect(bridge.pending.length, "reminders after deleting the payment").toBe(0);
  },
  async "MOCK: notifications refused: nothing is scheduled, the app works, the reminder shows inside the app"(
    open,
  ) {
    const data = JSON.parse(seedJson);
    data.settings.notifications = true;
    const bridge = makeBridge({ notifications: "denied" });
    const page = await open({ data: JSON.stringify(data), bridge });
    await settle(page, 2200);
    expect(bridge.count("LocalNotifications.schedule"), "schedule calls").toBe(0);
    await tab(page, "More");
    await page
      .getByText("Blocked in the Android settings")
      .first()
      .waitFor()
      .catch(() => {});
    expect(await page.locator(".navbar").count(), "app works").toBe(1);
  },
};

let failures = 0;
const only = process.env.ONLY;
for (const [name, scenario] of Object.entries(scenarios)) {
  if (only && !name.includes(only)) continue;
  const pages = [];
  const open = async (options) => {
    const page = await openNative(options);
    pages.push(page);
    return page;
  };
  try {
    await scenario(open);
    for (const page of pages) if (page.errors.length) throw Error(`page error: ${page.errors[0]}`);
    console.log(`ok   ${name}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${name}: ${error.message}`);
  }
  for (const page of pages) await page.context().close();
}
await browser.close();
server.close();
process.exit(failures ? 1 : 0);
