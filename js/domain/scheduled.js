/* Scheduled payments: the next date and posting a due payment */
import { deepClone, newId, TODAY } from "../core/constants.js";
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
    const y = base.getUTCFullYear(),
      m = base.getUTCMonth(),
      day = base.getUTCDate(),
      delta = r.unit === "Years" ? 12 * r.every : r.every;
    const d = new Date(Date.UTC(y, m + delta, 1, 12));
    d.setUTCDate(
      Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()),
    );
    result = toIsoDate(d);
  }
  return result || null;
}

// Post or skip a due scheduled payment and schedule the next one.
export function processScheduled(id, post) {
  const item = appData.scheduled.find((o) => o.id === id);
  if (!item) return;
  if (post) {
    const op = { ...deepClone(item), id: newId(), date: TODAY };
    delete op.recur;
    delete op.reminder;
    putOperation(op);
  }
  const n = nextDate(item);
  if (n) {
    item.date = n;
    if (item.recur.remaining !== null) item.recur.remaining--;
  } else appData.scheduled = appData.scheduled.filter((o) => o.id !== id);
  save();
}
