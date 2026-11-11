// Scheduled payments: the next date of a rule, and posting what came due — exactly once per occurrence.
// The operation of an occurrence has a deterministic id (payment id + occurrence day), so the app, a
// background task and, one day, a server that post the same occurrence produce the same record.
import { addDays, addMonths, parseDate } from "./dates.ts";
import type { LedgerTx } from "./change.ts";
import type { Env } from "./env.ts";
import { planFutureOperations, putOperation } from "./operations.ts";
import type { LocalDate, LocalTime, Operation, Reminder, ScheduledPayment } from "./types.ts";

const toMinutes = (time: LocalTime): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const toClock = (n: number): LocalTime =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

// A reminder on the day of the payment has to come before the payment time.
export const comesAfterPayment = (reminder: Reminder | null, time: LocalTime | undefined): boolean =>
  !!reminder && !!time && reminder.before === 0 && reminder.unit === "Days" && reminder.time >= time;

// The reminder to keep once the payment time becomes `time` (moved with its lead, or dropped).
export function reminderForTime(reminder: Reminder | null, oldTime: LocalTime | undefined, time: LocalTime): Reminder | null {
  if (!reminder || !comesAfterPayment(reminder, time)) return reminder;
  const lead = oldTime && reminder.time < oldTime ? toMinutes(oldTime) - toMinutes(reminder.time) : null;
  const moved = lead === null ? -1 : toMinutes(time) - lead;
  return moved >= 0 ? { ...reminder, time: toClock(moved) } : null;
}

// The next occurrence of a rule, or null when it is finished.
export function nextDate(item: ScheduledPayment): LocalDate | null {
  const r = item.recur;
  if (!r || !(r.every > 0)) return null;
  if (r.remaining !== null && r.remaining <= 1) return null;
  const base = parseDate(item.date);
  if (r.unit === "Days") return addDays(item.date, r.every);
  if (r.unit === "Weeks") {
    const days = r.days?.length ? r.days : [base.getUTCDay()];
    const startOfBase = addDays(item.date, -base.getUTCDay());
    for (let n = 1; n <= r.every * 7 + 7; n++) {
      const next = addDays(item.date, n);
      const dt = parseDate(next);
      const week = Math.floor((parseDate(addDays(next, -dt.getUTCDay())).getTime() - parseDate(startOfBase).getTime()) / 604800000);
      if (days.includes(dt.getUTCDay()) && (week === 0 || week % r.every === 0)) return next;
    }
    return null;
  }
  const months = r.unit === "Years" ? 12 * r.every : r.every;
  return addMonths(item.date, months, item.anchorDay ?? base.getUTCDate());
}

// The payment moved to its next occurrence, or null after the last one.
export function advanced(item: ScheduledPayment): ScheduledPayment | null {
  const next = nextDate(item);
  if (!next || !item.recur) return null;
  return {
    ...item,
    date: next,
    recur: { ...item.recur, remaining: item.recur.remaining === null ? null : item.recur.remaining - 1 },
  };
}

// Due: its day came and, when it has a time, that time too.
export const isDue = (item: ScheduledPayment, day: LocalDate, time: LocalTime): boolean =>
  item.date < day || (item.date === day && (!item.time || item.time <= time));

export const occurrenceId = (paymentId: string, date: LocalDate): string => `${paymentId}~${date}`;

const isPosted = (tx: LedgerTx, item: ScheduledPayment, occurrence: LocalDate): boolean =>
  tx.data.ops.some((o) => o.fromSchedule?.id === item.id && o.fromSchedule.date === occurrence);

// Records one occurrence as an operation of `day`, once. Returns it, or null when already recorded.
function postOccurrence(tx: LedgerTx, item: ScheduledPayment, day: LocalDate, env: Env, byHand = false): Operation | null {
  if (isPosted(tx, item, item.date)) return null;
  const op: Operation & Partial<ScheduledPayment> = { ...item, id: occurrenceId(item.id, item.date), date: day };
  delete op.recur;
  delete op.reminder;
  delete op.anchorDay;
  if (item.time) op.time = item.time;
  op.fromSchedule = { id: item.id, date: item.date, postedAt: env.clock.nowIso(), ...(byHand ? { byHand } : {}) };
  // A typed second amount of the payment is posted as typed; otherwise it is priced today.
  return putOperation(tx, op, env).saved;
}

const clockFor = (day: LocalDate, env: Env): LocalTime => (day === env.clock.today() ? env.clock.time() : "23:59");

// "Add now" (post) or "Skip" one occurrence, then go on to the next one.
export function processScheduled(tx: LedgerTx, id: string, post: boolean, env: Env): Operation | null {
  const item = tx.get("scheduled", id);
  if (!item) return null;
  const op = post ? postOccurrence(tx, item, env.clock.today(), env, true) : null;
  const next = advanced(item);
  if (next) tx.put("scheduled", next);
  else tx.remove("scheduled", id);
  return op;
}

// Moves a payment past `day`, posting the occurrences on the way or not; returns posted ids.
function catchUp(tx: LedgerTx, start: ScheduledPayment, day: LocalDate, post: boolean, time: LocalTime, env: Env): string[] {
  const posted: string[] = [];
  let item: ScheduledPayment | null = start;
  while (item && isDue(item, day, time)) {
    const op = post ? postOccurrence(tx, item, item.date, env) : null;
    if (op) posted.push(op.id);
    item = advanced(item);
  }
  if (item) tx.put("scheduled", item);
  else tx.remove("scheduled", start.id);
  return posted;
}

const CATCH_UP_LIMIT = 31;
const CATCH_UP_DAYS = 365;

export interface DueEntry {
  item: ScheduledPayment;
  count: number;
  since: LocalDate;
}

function dueEntries(items: readonly ScheduledPayment[], day: LocalDate, time: LocalTime): DueEntry[] {
  return items
    .filter((item) => isDue(item, day, time))
    .map((item) => {
      let probe: ScheduledPayment | null = item;
      let count = 0;
      while (probe && isDue(probe, day, time)) {
        count++;
        probe = advanced(probe);
      }
      return { item, count, since: item.date };
    });
}

const needsAnswer = ({ count, since }: DueEntry, day: LocalDate): boolean =>
  count > CATCH_UP_LIMIT || since < addDays(day, -CATCH_UP_DAYS);

// Posts every occurrence that came due, each on its own day. A payment that cannot be posted (its
// account or category is gone) stays as it is and the others go on; one far behind waits for the
// person (`missedPayments`). Returns the ids of the operations posted.
export function postDue(tx: LedgerTx, env: Env): { posted: string[]; failed: string[] } {
  const day = env.clock.today();
  const time = clockFor(day, env);
  planFutureOperations(tx, env);
  const posted: string[] = [];
  const failed: string[] = [];
  for (const entry of dueEntries(tx.data.scheduled, day, time)) {
    if (needsAnswer(entry, day)) continue;
    const mark = tx.mark();
    try {
      posted.push(...catchUp(tx, entry.item, day, true, time, env));
    } catch {
      tx.restore(mark);
      failed.push(entry.item.id);
    }
  }
  return { posted, failed };
}

export const missedPayments = (items: readonly ScheduledPayment[], env: Env): DueEntry[] => {
  const day = env.clock.today();
  return dueEntries(items, day, clockFor(day, env)).filter((entry) => needsAnswer(entry, day));
};

// The answer about a payment far behind: add what was missed, or skip to the next occurrence.
export function settleMissed(tx: LedgerTx, id: string, post: boolean, env: Env): string[] {
  const item = tx.get("scheduled", id);
  if (!item) return [];
  const day = env.clock.today();
  return catchUp(tx, item, day, post, clockFor(day, env), env);
}
