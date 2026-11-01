# Plan: scheduled payments, the operations they create, and budgets

Status: proposed, nothing of it is built yet. The part already built: due payments are posted on
their own at launch and when the app returns to the screen, and a notice says how many.

## Principle

The application has no server yet. What a server will do later is decided now, in the shape of
the code, so that nothing has to be rebuilt or patched over:

1. **One engine, no screen in it.** `domain/` gets a pure description of a schedule: "which
   occurrences fall between two moments, when each is due, when each reminds". The device uses it
   today at launch; a server will use the same module later.
2. **Posting is idempotent.** An operation made from a schedule records which schedule and which
   occurrence it came from. Posting the same occurrence twice (two devices, the device and the
   server) is recognised and does nothing.
3. **Delivery is a port.** Showing a reminder is a function behind a small interface in
   `platform/`. Today the only thing behind it is nothing (no fake reminders); later push.
4. **Only what works is offered.** A setting that has no effect yet stays visible only as it is
   now; no screen pretends.

## What is wrong or missing today

| Area              | Finding                                                                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monthly repeat    | The day drifts: 31 Jan → 28 Feb → 28 Mar → 28 Apr. The first day of the rule is lost once a short month clamps it.                                                                 |
| Time              | A payment has a date only. An operation has a date only. A reminder has a time but only counts whole days, weeks, months or years before. No "2 hours before", no "at the moment". |
| Ending            | A repeat ends only after N times. There is no "until this date".                                                                                                                   |
| Past date         | A payment dated far in the past posts every missed occurrence at once at the next launch (a daily one from two years ago: about 730 operations) without a word.                    |
| Link              | A posted operation does not remember the payment it came from, and what was planned (amount, day, accounts) is not kept. So it cannot be found, compared or explained.             |
| Filters           | The filters sheet has accounts, categories, type, tags, comment. Nothing about where an operation came from. The scheduled list has no filters or search.                          |
| Scheduled list    | Only grouped by day, ascending or descending. No "today / this week / later", no totals, no pause, no sign of what is overdue.                                                     |
| Editing a payment | One editor; no choice between "this payment only" and "this and the following".                                                                                                    |
| Budgets           | Tapping a card edits it; the operations behind the sum cannot be seen. No warning colour before the limit, no "per day left", planned payments are not counted.                    |
| Settings          | Notifications, periodic reminders, time, frequency and automatic rates are stored and do nothing. Left as they are by decision.                                                    |
| Today's date      | Screens use a date fixed at load; an app left open past midnight shows yesterday as today until reloaded.                                                                          |

## Rules for the operations a payment creates

A posted payment is an ordinary operation: balances, statistics and budgets count it like any
other. Nothing about the maths is restricted. What is added is knowledge, not limits.

- Everything stays editable: amount, day, accounts, category, comment, tags. A person pays late,
  early, a different amount, from another account. All of that is true and is allowed.
- The operation keeps `fromSchedule: { id, date, planned: { amount, from, to, category } }`.
  `date` is the occurrence it settled, which does not change when the operation is moved.
- The operation sheet shows a line "Scheduled payment" and, when something differs from the plan,
  one short line: "Planned 20 on Fri, paid 22 on Sat".
- Deleting it removes the money from the history and does **not** put the occurrence back; the
  confirmation says so. Deleting the schedule leaves the history untouched; its confirmation says
  so too.
- Bulk edit works as for any operation.
- Deleting an account or category already removes its schedules (existing rule, stays).

## Data

Additive and optional, so old documents keep loading and the storage key stays:

- Schedule record: `time` ("HH:MM", optional), `until` (day, optional), `paused` (boolean),
  `anchorDay` (the day of the month a monthly or yearly rule keeps; fixes the drift).
- Reminder: `unit` gains Minutes and Hours next to Days, Weeks, Months, Years; `before` and `time`
  stay. Existing reminders are valid as they are.
- Operation: `fromSchedule` as above. Absent on every operation entered by hand.
- `isValidData` and `completeData` learn the new fields; a migration check in `tests/data.test.js`.

## Filters

A new row in the filters sheet, **Source**, one choice in the same option sheet style as the rest:

1. All operations
2. Scheduled payments
3. Scheduled payments I changed (amount, day, account or category differs from the plan)
4. Entered by hand

It combines with accounts, categories, type, tags and comment, so "scheduled, changed, from this
card, food" works. The scheduled list gets the same filter sheet (without Source) and the search
bar, so a payment is found by account, category or comment. The notice after automatic posting
opens the operations filtered by Source = Scheduled payments for the period that holds them.

## Screens

**Creating a payment.** The "Select date" sheet keeps its tiles: date, **time** (new, optional),
repeat, reminder. A date in the past asks once: "This date has passed. Add the missed payments
to the history?" with the number, and Yes / Only from today. The repeat dialog gets "until a date" next to the
number of repeats and a line "Next: 31 Jan, 28 Feb, 31 Mar".

**Reminder dialog.** "Before" takes minutes, hours, days, weeks, months or years; zero means at
the moment. The same text rule as now for zero.

**Scheduled list.** Groups: Overdue (only possible when something failed to post), Today, This week,
Later. A header with what is expected this month (expenses, incomes). Each row shows the next
date, the repeat and the reminder as now; a paused payment is dimmed. Row actions in the sheet:
Skip, Add now (as now), Pause or Resume, Duplicate, Delete.

**Editing.** Opening a payment edits the rule. For a payment that repeats, saving asks "All following
payments" or "Only the next one" (the second is Add now with changes, or a one-time override).
The editor shows which occurrences the change touches.

**Budgets.** Tapping a card opens a page: spent, limit, left, **per day left**, the operations of
the period (the filtered list, same as a category), and an Edit button. The bar gets a warning colour
at a fixed share (80 %) and the existing red over the limit. A line "Planned payments: N" counts the
scheduled expenses of the period in the budget's categories, so "left" can be read with and
without them. Rollover of the remainder is a later option, not part of this plan.

All of it uses the existing pieces: sheets with the pinned footer, option sheets, hint banners,
switch cards, the filters sheet. No new visual language.

## Reminders and the server

- **Now:** reminders are stored and shown in the list. Nothing is sent. Hours and minutes are
  accepted in the data and the dialog so that a payment created today works when delivery arrives.
- **With a server:** the server holds the same schedule records (synced), runs the same engine for
  "due" and "remind at", posts through the same idempotent step, and sends push through the
  platform port. A tap on the push opens the app at the scheduled list or at the filtered
  operations. The device keeps posting at launch, so nothing is posted twice and nothing is missed.
- Notifications settings page then reads the real permission and shows its state instead of
  switches that do nothing.

## Order of work

1. **Engine and data.** Anchor day, `until`, `time`, `paused`, `fromSchedule`, idempotent posting,
   guard for a large catch-up, fresh date helper used by the engine. Domain checks for every case
   above (31 Jan, leap day, weekdays with every 2 weeks, until, paused, same occurrence posted
   twice, one-time payment, 730 missed days).
2. **Operations side.** Link and plan snapshot, operation sheet line, Source filter, notice leads to
   the filtered list. Scenarios.
3. **Scheduled screen.** Groups, header totals, pause, time tile, past-date question, until,
   next-dates line, edit scope, filters and search.
4. **Reminder model.** Minutes and hours, the delivery port with its empty adapter, wording of
   what the list says.
5. **Budgets.** Detail page, per day left, warning colour, planned payments line.
6. **Server.** Sync, the engine on the server, push adapter, notification settings page.

Each step: domain checks first, then screens, a scenario for what a person does, the visual
comparison, documents updated, one pull request.

## What I need from the original

Short video, one take: create a payment for tomorrow with a repeat and a reminder, open every
dialog (date, time if there is one, repeat, reminder: show the list of units), save; then open the
list and the payment; then open an operation that a payment has created, if the original shows
one, and the filters. This decides: is there a time of day, which reminder units exist, what the
posted operation shows and which fields it lets you change.
