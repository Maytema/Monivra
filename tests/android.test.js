/* The parts of the Android shell that are plain logic: which reminders are handed to the system, the
   numbers it is given, the PIN marker and the color of the system bars. What needs a real phone
   (the system screens, the keystore, the alarms) is NOT checked here; the browser scenarios that
   drive these paths use a mock of the bridge and say so, and the rest is on the phone checklist. */
import { check } from "./harness.js";
import { appData } from "../js/core/state.js";
import { addDays } from "../js/domain/finance.js";
import { dueReminders, dayAndTime } from "../js/domain/reminders.js";
import { upcomingReminders } from "../js/domain/reminder-plan.js";
import { notificationId } from "../js/platform/notify.js";
import { pinMarker, makePin, protectedPin, pinMatches } from "../js/platform/pin.js";
import { cssToHex } from "../js/platform/system-bars.js";

const NOON = new Date(2026, 5, 10, 12, 0);
const day = (n) => dayAndTime(new Date(2026, 5, 10 + n, 12, 0))[0];

const payment = (over = {}) => ({
  id: "p1",
  type: "expense",
  amount: 1000,
  date: day(3),
  time: "09:00",
  comment: "",
  tags: [],
  from: appData.accounts[0].id,
  category: appData.categories.find((c) => c.type === "expense" && !c.parent).id,
  reminder: { before: 1, unit: "Days", time: "08:30" },
  recur: null,
  ...over,
});
const withScheduled = (items, settings = {}) => ({
  ...appData,
  scheduled: items,
  settings: { ...appData.settings, notifications: true, periodic: false, ...settings },
});

check("reminders to hand to the system: one for a payment, on the reminder day and time", () => {
  const plan = upcomingReminders(withScheduled([payment()]), NOON);
  if (plan.length !== 1) throw Error(`expected 1, got ${plan.length}`);
  const [r] = plan;
  if (r.key !== `payment:p1:${day(3)}`) throw Error(r.key);
  const [d, t] = dayAndTime(r.at);
  if (d !== day(2) || t !== "08:30") throw Error(`${d} ${t}`);
});

check("a reminder in the past is not handed to the system (the app shows it itself)", () => {
  const plan = upcomingReminders(withScheduled([payment({ date: day(1) })]), NOON);
  // The reminder day is today at 08:30, which is before 12:00 now.
  if (plan.length !== 0) throw Error("a past reminder was planned");
});

check(
  "every planned reminder has the key the app uses to show a due one, so none is shown twice",
  () => {
    const data = withScheduled([payment()]);
    const plan = upcomingReminders(data, NOON);
    const at = plan[0].at;
    const due = dueReminders(data, new Date(at.getTime() + 60000), new Set());
    if (!due.some((d) => d.key === plan[0].key)) throw Error("keys differ");
  },
);

check(
  "a repeating payment gets a reminder for each coming occurrence, none beyond the horizon",
  () => {
    const item = payment({
      date: day(1),
      recur: { every: 1, unit: "Weeks", days: [], remaining: null },
    });
    const plan = upcomingReminders(withScheduled([item]), NOON, { days: 30 });
    const keys = plan.filter((r) => r.kind === "payment").map((r) => r.key);
    if (keys.length < 4 || keys.length > 5) throw Error(`got ${keys.length}`);
    if (new Set(keys).size !== keys.length) throw Error("duplicates");
    const last = plan.at(-1).at;
    if (dayAndTime(last)[0] > addDays(day(0), 30)) throw Error("beyond the horizon");
  },
);

check("a repeating payment with a count left plans only the occurrences it has", () => {
  const item = payment({ date: day(1), recur: { every: 1, unit: "Days", days: [], remaining: 3 } });
  const plan = upcomingReminders(withScheduled([item]), NOON, { days: 30 });
  const n = plan.filter((r) => r.kind === "payment").length;
  if (n > 3) throw Error(`planned ${n} for 3 occurrences`);
});

check("notifications off: nothing is handed to the system", () => {
  const data = withScheduled([payment()], { notifications: false });
  if (upcomingReminders(data, NOON).length) throw Error("planned while off");
});

check("the periodic reminder is planned for matching days only, never in the past", () => {
  const data = withScheduled([], {
    periodic: true,
    notificationTime: "20:00",
    notificationFrequency: "Weekends",
  });
  const plan = upcomingReminders(data, NOON, { days: 14 });
  if (!plan.length) throw Error("none planned");
  for (const r of plan) {
    if (r.at <= NOON) throw Error("in the past");
    if (![0, 6].includes(r.at.getDay())) throw Error("not a weekend");
  }
});

check("at most `limit` reminders, nearest first", () => {
  const items = Array.from({ length: 10 }, (_, i) => payment({ id: `p${i}`, date: day(2 + i) }));
  const plan = upcomingReminders(withScheduled(items), NOON, { limit: 4 });
  if (plan.length !== 4) throw Error(`got ${plan.length}`);
  for (let i = 1; i < plan.length; i++) if (plan[i].at < plan[i - 1].at) throw Error("not sorted");
});

check("notification numbers are stable, positive and fit the system's 32 bits", () => {
  const a = notificationId("payment:abc:2026-06-10");
  if (a !== notificationId("payment:abc:2026-06-10")) throw Error("not stable");
  if (a === notificationId("payment:abc:2026-06-11")) throw Error("clash");
  if (!(a > 0 && a < 2 ** 31)) throw Error(`out of range ${a}`);
});

check(
  "a PIN marker means nothing without the system storage: it becomes no PIN, never a lock-out",
  () => {
    const marker = pinMarker(makePin("1234"));
    if (marker.native !== true || marker.length !== 4 || "hash" in marker)
      throw Error("bad marker");
    if (protectedPin(marker) !== false) throw Error("a marker without a sealed hash was kept");
    if (pinMatches(marker, "1234")) throw Error("a marker matched without a hash");
    const hash = makePin("1234");
    if (protectedPin(hash) !== hash) throw Error("a real hash was changed");
  },
);

check("the color of the system bars is read from the colors the browser reports", () => {
  if (cssToHex("rgb(255, 250, 254)") !== "#fffafe") throw Error("rgb");
  if (cssToHex("rgba(18, 16, 20, 1)") !== "#121014") throw Error("rgba");
  if (cssToHex("color(srgb 1 0.980392 0.996078)") !== "#fffafe") throw Error("color()");
  if (cssToHex("transparent") !== null) throw Error("transparent");
});
