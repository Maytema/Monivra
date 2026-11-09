/* Scheduled payments: the next date and posting a due payment */
import { deepClone, newId, timeNow, today } from "../core/constants.js";
import { appData } from "../core/state.js";
import { save } from "../data/storage.js";
import { planFutureOperations, putOperation } from "./operations.js";
import { addDays, parseDate, toIsoDate } from "./finance.js";

const toMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const toClock = (n) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

// A reminder on the day of the payment has to come before the payment time.
export const comesAfterPayment = (reminder, time) =>
  !!reminder &&
  !!time &&
  reminder.before === 0 &&
  reminder.unit === "Days" &&
  reminder.time >= time;

// The reminder to keep once the payment time becomes `time`. One that still comes before it stays;
// one that would come after it moves along and keeps its lead before the payment, and is dropped
// (null) when there is no room left before the payment on that day.
export function reminderForTime(reminder, oldTime, time) {
  if (!comesAfterPayment(reminder, time)) return reminder;
  const lead =
    oldTime && reminder.time < oldTime ? toMinutes(oldTime) - toMinutes(reminder.time) : null;
  const moved = lead === null ? -1 : toMinutes(time) - lead;
  return moved >= 0 ? { ...reminder, time: toClock(moved) } : null;
}

// Next occurrence of a recurring payment, or null when finished.
export function nextDate(item) {
  const r = item.recur;
  if (!r || !(r.every > 0)) return null;
  if (r.remaining !== null && r.remaining <= 1) return null;
  const base = parseDate(item.date);
  let result;
  if (r.unit === "Days") result = addDays(item.date, r.every);
  else if (r.unit === "Weeks") {
    const days = r.days?.length ? r.days : [base.getUTCDay()];
    const startOfBase = addDays(item.date, -base.getUTCDay());
    for (let n = 1; n <= r.every * 7 + 7; n++) {
      const next = addDays(item.date, n),
        dt = parseDate(next),
        week = Math.floor(
          (parseDate(addDays(next, -dt.getUTCDay())) - parseDate(startOfBase)) / 604800000,
        );
      if (days.includes(dt.getUTCDay()) && (week === 0 || week % r.every === 0)) {
        result = next;
        break;
      }
    }
  } else {
    // The rule keeps its own day: after a short month the next one is on that day again.
    const y = base.getUTCFullYear(),
      m = base.getUTCMonth(),
      day = item.anchorDay ?? base.getUTCDate(),
      delta = r.unit === "Years" ? 12 * r.every : r.every;
    const d = new Date(Date.UTC(y, m + delta, 1, 12));
    d.setUTCDate(
      Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()),
    );
    result = toIsoDate(d);
  }
  return result || null;
}

// Move a payment to its next occurrence; false when that was the last one.
function advance(item) {
  const next = nextDate(item);
  if (!next) return false;
  item.date = next;
  if (item.recur.remaining !== null) item.recur.remaining--;
  return true;
}

// Is an occurrence due: its day came, and when it has a time, that time too. `now` is the moment
// being checked, local day and time.
export const isDue = (item, day, time) =>
  item.date < day || (item.date === day && (!item.time || item.time <= time));
// The time of day to check against: the real one for today, the end of any other day.
const clockFor = (day) => (day === today() ? timeNow() : "23:59");

// Was this occurrence of the payment already recorded (here or by another device)?
const isPosted = (item, occurrence) =>
  appData.ops.some((o) => o.fromSchedule?.id === item.id && o.fromSchedule.date === occurrence);

// Record one occurrence of a scheduled payment as an operation of the given day. The operation
// remembers the payment and the occurrence it settles, so it can be told apart from one entered by
// hand, and tells a payment the person added ahead of time from one made on its day. An occurrence
// is recorded only once. Returns the new operation, or nothing when it was recorded already.
function postOccurrence(item, day, byHand = false) {
  if (isPosted(item, item.date)) return null;
  const op = { ...deepClone(item), id: newId(), date: day };
  delete op.recur;
  delete op.reminder;
  delete op.anchorDay;
  // The operation keeps the day and time the payment was set for; `postedAt` is when it was done.
  if (item.time) op.time = item.time;
  op.fromSchedule = {
    id: item.id,
    date: item.date,
    postedAt: new Date().toISOString(),
    ...(byHand && { byHand }),
  };
  putOperation(op);
  return op;
}

// Post or skip a scheduled payment and schedule the next one.
export function processScheduled(id, post) {
  const item = appData.scheduled.find((o) => o.id === id);
  if (!item) return;
  if (post) postOccurrence(item, today(), true);
  if (!advance(item)) appData.scheduled = appData.scheduled.filter((o) => o.id !== id);
  save();
}

// Move a payment on to its first occurrence after `day`, posting the ones in between or not;
// returns the ids of the operations posted. A payment that has no occurrence left goes away.
function catchUp(item, day, post, time = clockFor(day)) {
  const posted = [];
  while (isDue(item, day, time)) {
    const op = post && postOccurrence(item, item.date);
    if (op) posted.push(op.id);
    if (!advance(item)) {
      appData.scheduled = appData.scheduled.filter((o) => o !== item);
      break;
    }
  }
  return posted;
}

// A catch-up that long is asked about instead of done: that many missed payments, or the first
// of them that long ago.
const CATCH_UP_LIMIT = 31;
const CATCH_UP_DAYS = 365;

// What is due up to `day` and not posted yet: each payment with how many occurrences that are and
// the day of the first.
function dueEntries(day, time = clockFor(day)) {
  return appData.scheduled
    .filter((item) => isDue(item, day, time))
    .map((item) => {
      const probe = deepClone(item);
      let count = 0;
      while (isDue(probe, day, time)) {
        count++;
        if (!advance(probe)) break;
      }
      return { item, count, since: item.date };
    });
}
const needsAnswer = ({ count, since }, day) =>
  count > CATCH_UP_LIMIT || since < addDays(day, -CATCH_UP_DAYS);

// Post every occurrence that came due up to `day` on the day it was due; returns the ids of the
// operations posted. What was posted before a failure stays posted and saved. A payment that is
// far behind waits for the person's answer (`missedPayments`).
export function postDue(day = today(), time = clockFor(day)) {
  const posted = [];
  // Operations dated ahead that came from a backup or a file wait for their day like any payment.
  const moved = planFutureOperations();
  try {
    for (const entry of dueEntries(day, time)) {
      if (needsAnswer(entry, day)) continue;
      // One payment that cannot be posted (its category or account is gone) stays where it is,
      // nothing of it is half done, and the others carry on.
      try {
        posted.push(...catchUp(entry.item, day, true, time));
      } catch (error) {
        console.error("Scheduled payment not posted", entry.item.id, error);
      }
    }
  } finally {
    if (posted.length || moved) save();
  }
  return posted;
}

// The payments far behind, which wait for the person to say whether to add what was missed.
export const missedPayments = (day = today()) =>
  dueEntries(day).filter((entry) => needsAnswer(entry, day));

// The answer about a payment far behind: add what was missed, or let it go and
// carry on from the next occurrence. Returns the ids of the operations added.
export function settleMissed(id, post, day = today()) {
  const item = appData.scheduled.find((o) => o.id === id);
  if (!item) return [];
  const posted = catchUp(item, day, post);
  save();
  return posted;
}
