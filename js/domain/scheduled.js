/* Scheduled payments: the next date and posting a due payment */
import { deepClone, newId, today } from "../core/constants.js";
import { appData } from "../core/state.js";
import { save } from "../data/storage.js";
import { putOperation } from "./operations.js";
import { addDays, parseDate, toIsoDate } from "./finance.js";

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

// Was this occurrence of the payment already recorded (here or by another device)?
const isPosted = (item, occurrence) =>
  appData.ops.some((o) => o.fromSchedule?.id === item.id && o.fromSchedule.date === occurrence);

// Record one occurrence of a scheduled payment as an operation of the given day. The operation
// remembers the payment and the occurrence it settles, so it can be told apart from one entered by
// hand, and tells a payment the person added ahead of time from one made on its day. An occurrence
// is recorded only once.
function postOccurrence(item, day, byHand = false) {
  if (isPosted(item, item.date)) return false;
  const op = { ...deepClone(item), id: newId(), date: day };
  delete op.recur;
  delete op.reminder;
  delete op.time;
  delete op.anchorDay;
  op.fromSchedule = { id: item.id, date: item.date, ...(byHand && { byHand }) };
  putOperation(op);
  return true;
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
// returns how many were posted. A payment that has no occurrence left goes away.
function catchUp(item, day, post) {
  let posted = 0;
  while (item.date <= day) {
    if (post && postOccurrence(item, item.date)) posted++;
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
function dueEntries(day) {
  return appData.scheduled
    .filter((item) => item.date <= day)
    .map((item) => {
      const probe = deepClone(item);
      let count = 0;
      while (probe.date <= day) {
        count++;
        if (!advance(probe)) break;
      }
      return { item, count, since: item.date };
    });
}
const needsAnswer = ({ count, since }, day) =>
  count > CATCH_UP_LIMIT || since < addDays(day, -CATCH_UP_DAYS);

// Post every occurrence that came due up to `day` on the day it was due; returns how many. What
// was posted before a failure stays posted and saved. A payment that is far behind waits for the
// person's answer (`missedPayments`).
export function postDue(day = today()) {
  let posted = 0;
  try {
    for (const entry of dueEntries(day))
      if (!needsAnswer(entry, day)) posted += catchUp(entry.item, day, true);
  } finally {
    if (posted) save();
  }
  return posted;
}

// The payments far behind, which wait for the person to say whether to add what was missed.
export const missedPayments = (day = today()) =>
  dueEntries(day).filter((entry) => needsAnswer(entry, day));

// The answer about a payment far behind: add what was missed (returns how many), or let it go and
// carry on from the next occurrence.
export function settleMissed(id, post, day = today()) {
  const item = appData.scheduled.find((o) => o.id === id);
  if (!item) return 0;
  const posted = catchUp(item, day, post);
  save();
  return posted;
}
