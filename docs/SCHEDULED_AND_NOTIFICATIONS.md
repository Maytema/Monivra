# Scheduled payments and reminders: how they work now, limits, and the future requirement

Status: reviewed on build 21 (commit `52bb7c5`), 2026-11-11. Russian copy: `SCHEDULED_AND_NOTIFICATIONS_RU.md`.

## 1. Scheduled payments: current behaviour

A scheduled payment is a record in `appData.scheduled`. It becomes real operations only when the
application code runs, in these places (`js/app/startup.js`, `js/domain/scheduled.js`):

- at launch (`bindDuePayments` → `postDuePayments`);
- when the app returns to the screen (`onVisibility`), and every 60 s while it is open (`tick`);
- right after a payment is saved with a date that has come (`settleDueNow`).

`postDue(day, time)` goes through every payment that is due (`isDue`: its day came and, when it has a
time, that time too) and `catchUp` posts each missed occurrence **on the day it was due**, then moves the
payment to its next occurrence (`advance`, `nextDate`) or removes it after the last one.

Why an occurrence cannot be posted twice:

- every posted operation carries `fromSchedule: { id, date, postedAt }` (which payment, which occurrence);
- `postOccurrence` refuses an occurrence that already has an operation (`isPosted`), also when another
  copy of the payment (an old backup, another device) comes due again;
- the payment's date is advanced in the same step that posts, and the data is saved after each `postDue`
  that did anything (`save()` in its `finally`);
- a catch-up that is too long (more than 31 occurrences, or older than 365 days) is not done silently:
  `missedPayments` / `askAboutMissed` ask the person to add or skip (`settleMissed`).

Checked by tests (`node tests/run.mjs`): "Missed payments are created exactly once, with the right dates,
amounts, categories, accounts and balances" (expense, income and transfer, three days missed, `postDue`
called three times: 12 operations, correct dates/amounts/categories/accounts, balances moved by exactly
4 × each amount, next date tomorrow), "Payments that came due are posted on the day they were due",
"One occurrence of a payment is posted only once", "A payment dated today waits for its time",
"Skip and Add now deal with one occurrence of one payment and leave the others alone", and the
Android emulator test (exactly once and the original time across a kill and relaunch).

## 2. Architectural limitation (stated plainly)

**Scheduled financial operations are not committed while the application is closed.**

The data (`monivra.offline.2026.v1`) lives in the WebView's `localStorage`, and the financial rules run
only as JavaScript inside the WebView, which exists only while the app process shows the page. A
notification of the system can remind the person, but it does not run these rules and moves no money.
If the phone is off, or the app is not opened, the payment is posted at the next launch with its own date
and time (section 1), so balances are right after opening, not before.

Decision recorded: **no workaround is to be added that writes the WebView's `localStorage` from an Android
background task** (a worker, a receiver, a service reading or editing the WebView's storage files). That
storage belongs to the WebView process, has no safe cross-process write path, and a second writer risks
corrupting or overwriting the person's data. The internal copy (`files/mirror`) is a backup of what the
web layer saved; it is not a second source of truth and must not be edited by background code.

## 3. Reminders (notifications): what is implemented

Code: `js/platform/notify.js`, `js/app/reminders.js`, `js/domain/reminder-plan.js`; plugin
`@capacitor/local-notifications` 7.x. No server; no network permission.

What is handed to the system: the next 60 days of reminders, at most 150 (`upcomingReminders`), rebuilt
(everything pending is cancelled, then scheduled again) 1.5 s after a save, at start, and when the app
returns to the front.

### Android and plugin APIs used

| Layer                                 | API                                                                                                                                            | Used for                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| JS → plugin                           | `LocalNotifications.checkPermissions()`, `requestPermissions()`                                                                                | state of the notification permission; asked only when the person switches notifications on |
| JS → plugin                           | `createChannel({ id: "payments", importance: 4 })`                                                                                             | channel "Payment reminders" (the person can mute it in Android settings)                   |
| JS → plugin                           | `getPending()`, `cancel()`, `schedule({ notifications: [{ id, title, body, channelId, largeIcon, schedule: { at, allowWhileIdle: true } }] })` | replace the scheduled reminders; `id` is a stable hash of the reminder key                 |
| Android framework (inside the plugin) | `AlarmManager`, a `BroadcastReceiver` (`TimedNotificationPublisher`), `NotificationManager` / `NotificationChannel`                            | delivery at the set time                                                                   |
| Android framework (inside the plugin) | `LocalNotificationRestoreReceiver` on `BOOT_COMPLETED`, `LOCKED_BOOT_COMPLETED`, `QUICKBOOT_POWERON`                                           | scheduling again after a restart                                                           |
| Resources                             | small icon `ic_stat_monivra` (one colour, transparent), large icon `ic_notification_large`                                                     | status bar and notification card                                                           |

Which `AlarmManager` method the plugin calls is the plugin's own choice. The compiled app (build 21)
contains references to `setExactAndAllowWhileIdle`, `setAndAllowWhileIdle`, `setExact`, `setAlarmClock` and
`canScheduleExactAlarms`. The Capacitor documentation states that from Android 12 scheduled notifications
are not exact unless `SCHEDULE_EXACT_ALARM` is in the manifest and the person has not switched it off, and
that `allowWhileIdle: true` is needed to fire during Doze, at most once per 9 minutes per app. Because this
project removes both exact-alarm permissions, the inexact path is expected. **Not verified on a real
phone**; the exact method chosen was not observed (the plugin source could not be read in this session).

### Permissions

| Permission                                | State                                                        | Why                                                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `POST_NOTIFICATIONS`                      | kept; runtime prompt on Android 13+                          | show notifications                                                                                                                    |
| `RECEIVE_BOOT_COMPLETED`                  | kept (added by the plugin)                                   | restore reminders after a restart                                                                                                     |
| `WAKE_LOCK`                               | kept (added by the plugin)                                   | deliver while idle                                                                                                                    |
| `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM` | **removed** in `AndroidManifest.xml` (`tools:node="remove"`) | exact alarms are special access; Google Play restricts them to apps whose core function is alarms/calendar; not needed for a reminder |
| `INTERNET`                                | removed                                                      | the app has no network access                                                                                                         |

### Timing accuracy (expected, not measured on a phone)

- Not exact. A reminder can arrive minutes late; in Doze the system opens short maintenance windows and
  `allowWhileIdle` alarms are limited to about one per 9 minutes per app, so reminders set for the same
  minute may be delivered one after another.
- Battery saver, a low battery, app standby buckets and manufacturer power managers (for example MIUI /
  HyperOS "battery restrictions", "autostart") can delay or drop alarms. Seen in practice: reminders
  "sometimes work, sometimes not" at 13–16 % battery.
- The reminder text and the payment time are not the same thing: the payment is posted by the app when it
  opens (section 1), at its own date and time.

### After a restart of the phone

The plugin's boot receiver (`LocalNotificationRestoreReceiver`, `directBootAware`) is declared in the
merged manifest for `BOOT_COMPLETED`, `LOCKED_BOOT_COMPLETED` and `QUICKBOOT_POWERON`; it is meant to
schedule again what the plugin stored. **Not tested here**: the emulator test does not restart the system.
Independently, the app rebuilds all reminders at its next start. Limits that stay: after a **force stop**
Android cancels alarms and does not run boot receivers until the person opens the app again; and the
horizon is 60 days, so a person who does not open the app for longer than that stops getting reminders
until they do.

### Limitations from battery optimisation (summary)

Doze and App Standby defer inexact alarms; battery saver may restrict background work; some manufacturers
stop apps that are not in a "never restrict" list; a force-stopped app gets nothing. The app does not ask
for battery-optimisation exemption (it would be an intrusive permission for a reminder).

### Review result

Reviewed the implementation above and the existing tests (reminder planning, notification ids,
mock-bridge scenarios: asked on switching on, granted → scheduled, refused → in-app reminder, permission
already given → scheduled at launch). No specific defect was found, so the notification implementation was
left unchanged. An optional improvement, not done: a switch "Exact reminder time" that asks for
`SCHEDULE_EXACT_ALARM` (special access, may be refused by the person and restricted by Play policy).

## 4. Future requirement: background execution of scheduled operations (React Native migration)

This is a requirement for a future migration, not something the current app does.

**R1. Scheduled automatic operations must be committed in the background, without opening the app.**
When a scheduled payment comes due, the operation is created and the balances change even if the app was
never opened that day.

**R2. One reliable database shared by the interface and the background code.** The data cannot stay in
WebView `localStorage`. It moves to a store that both the UI and a background task can open safely
(for example SQLite with transactions on Android), with one defined writer discipline.

**R3. Idempotent posting.** An occurrence is identified by (payment id, occurrence date) with a unique
constraint, so a background run, a later app launch, a retry, or a restored backup can never create it
twice. Posting an occurrence and advancing the payment's next date happen in **one transaction**.

**R4. Android scheduling mechanisms.** Use the mechanisms Android provides for work that must run later:
`WorkManager` (periodic and, where allowed, expedited work) as the base, and `AlarmManager` to wake the
app near the due time; exact alarms (`SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM`) only where Google Play
policy allows them. Reschedule after a restart (`BOOT_COMPLETED`) and after the app is updated.

**R5. Catch-up stays.** Whatever runs in the background, the app must still catch up on open (what the
phone could not run: Doze, restrictions, force stop, being off), with the same exactly-once guarantee and
the same rules for payments far behind (ask the person).

**R6. Same financial rules.** The posting logic (`postOccurrence`, `catchUp`, `nextDate`, fees, currency
conversion, time rules) is the one defined and tested today; it must be moved or shared, not rewritten from
memory, and the 223+ unit checks and the scenarios must pass on it unchanged.

**R7. Migration of existing data.** Existing users' JSON data (`monivra.offline.2026.v1`, the internal
copy) is imported into the new store without loss, once, and verified (counts, balances) before the old
copy is removed.

**R8. Honest limits.** Moving to React Native does **not** by itself remove Android's background-execution
restrictions. Headless JS tasks, `WorkManager` jobs and alarms are all subject to Doze, App Standby
buckets, battery saver, exact-alarm policy, manufacturer power managers and force stop. The requirement is
therefore "late but exactly once, and correct on the next opportunity", not "always at the exact minute".
The same design could also be built natively on the current Capacitor shell; React Native is not what
provides the guarantee, the shared database, the background mechanisms and the idempotent posting are.

**Acceptance (to be tested on real phones and an emulator):** a payment due while the app is closed is an
operation, with correct date/amount/category/account and balances, before the app is next opened (within the
limits of R8); after a restart of the phone the same; after a force stop and reopening, exactly once;
a restored backup does not duplicate occurrences.
