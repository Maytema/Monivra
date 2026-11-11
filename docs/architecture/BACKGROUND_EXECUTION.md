# Scheduled transactions and background execution

Labels: see [README.md](README.md#evidence-labels-used-in-every-document). Current behaviour and its review
are in `docs/SCHEDULED_AND_NOTIFICATIONS.md` (requirements R1–R8 there are the input of this document).
**No exact execution time is promised anywhere below.**

## 1. Five different things

| #   | Mechanism                         | What it does                                                     | Moves money? | Today [V]                                    |
| --- | --------------------------------- | ---------------------------------------------------------------- | ------------ | -------------------------------------------- |
| 1   | Scheduled local notification      | Shows a reminder at about a time                                 | **No**       | Yes (Capacitor local notifications, inexact) |
| 2   | Background execution              | Runs our code while the app is not on screen                     | Only via #3  | No                                           |
| 3   | Recording the financial operation | Inserts the occurrence as an operation and advances the schedule | **Yes**      | Only while the app runs                      |
| 4   | Catch-up after reopening          | Does #3 for everything that came due while nothing ran           | Yes          | Yes [T]                                      |
| 5   | Server-side scheduled execution   | A server does #3 in the cloud ledger                             | Yes (cloud)  | No (no server)                               |

## 2. The one posting function (idempotent)

```
postDueOccurrences(now, source):              // source: launch | foreground | timer | background | server
  in ONE transaction (single writer):
    for each scheduled_payment with next_date/time due at `now` (local day + time):
      if behind more than 31 occurrences or 365 days → leave for the person (today's rule), continue
      for each due occurrence date d (in order):
        id = uuidv5(schedule.id + d)
        INSERT operation(id, …template…, schedule_id, occurrence_date = d, posted_at = now)
          ON CONFLICT DO NOTHING                       -- UNIQUE(schedule_id, occurrence_date)
        advance schedule (next_date, remaining) or delete it after the last occurrence
  after commit: rebuild reminders; tell the UI what was posted (if on screen)
```

- A failure inside one schedule (deleted account/category) skips that schedule and keeps the others
  (today's rule [T]), recorded in the local log.
- The same function is called from every source; double runs (timer + background at the same minute)
  cannot double-post: the unique index and the deterministic id decide.
- Rates used for cross-currency templates: the current table at posting time (today's behaviour), unless
  the person typed the second amount (`receive_manual`).

## 3. Android

| Tool                                                          | Use                                                                                   | Limits [D unless noted]                                                                                                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `expo-notifications` date trigger                             | Reminders (#1)                                                                        | Inexact by default; Doze batches; OEM battery managers may delay/drop; force stop cancels alarms until next launch; `alarmClock` delivery (SDK 58) is for alarms — policy question Q-N1 |
| WorkManager (via `expo-background-task` or our module)        | Periodic posting (#2→#3), e.g. every 1–6 h, plus a one-off job near the next due time | Minimum 15 min periodic; runs when the system allows; Expo's task also requires battery-not-low **and network** (Expo docs) → PoC P3; our own module can drop the network constraint    |
| AlarmManager exact (`SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM`) | Wake near the due minute                                                              | Special access; Google Play limits `USE_EXACT_ALARM` to alarm/calendar apps; the person can revoke; **not recommended** for v1                                                          |
| Boot / package-replaced receivers                             | Re-register reminders and work after reboot/update                                    | WorkManager persists work across reboots; notification triggers must be re-scheduled by us at next launch                                                                               |
| Force stop                                                    | —                                                                                     | Android cancels alarms and jobs and blocks receivers until the person opens the app again                                                                                               |

Expected Android result: most due payments recorded within minutes to a few hours of their time when the
phone is used normally; later under battery saver, aggressive OEM policies or after force stop; **always
at next launch** at the latest (#4). To be measured in PoC P3 on at least two vendors (e.g. Pixel/AOSP
emulator + Xiaomi/HyperOS, which the owner uses).

## 4. iOS (future)

| Tool                                                                       | Limits [D]                                                                                                                                                          |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local notifications (UNCalendarNotificationTrigger via expo-notifications) | Reliable delivery of reminders (#1); limit on pending notifications per app (iOS keeps the soonest 64 — re-check) → plan the nearest reminders only                 |
| BGTaskScheduler (via `expo-background-task`)                               | The system chooses when (often overnight, on charge); short intervals ignored; never runs after the person swipes the app away until relaunch; no simulator support |
| Silent push                                                                | Needs a server and is throttled; still not guaranteed                                                                                                               |

Expected iOS result: background posting is **opportunistic**; the dependable path is catch-up at launch
(#4) and, with a server, #5.

## 5. What can be done fully offline, and what needs a backend

| Requirement                                                  | Offline only (no server)                          | Needs backend + sync                                                               |
| ------------------------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Remind the person about a payment                            | Yes (#1), inexact on Android                      | No                                                                                 |
| Operation exists with correct date/amount by the next launch | **Yes, guaranteed** (#4)                          | No                                                                                 |
| Operation recorded while the app stays closed                | Best effort on Android (#2/#3); unreliable on iOS | Server (#5) records it in the cloud ledger; the phone shows it only after it syncs |
| Balance correct on another device without opening this one   | No                                                | Yes (#5 + sync)                                                                    |
| Posting at the exact minute while the phone is off/offline   | **Impossible**                                    | Cloud ledger only; the phone learns later                                          |

## 6. Tests required (see TEST_STRATEGY)

- Domain: due-occurrence generation for every rule (days/weeks with weekdays/months with anchor 29–31/years
  with Feb 29), remaining counts, far-behind threshold, time-of-day, DST and time-zone change.
- DB: concurrent calls from two connections (UI + background) post once; crash between insert and advance
  (transaction) leaves nothing half done; deleted operation then re-run follows the parity decision (Q-F6).
- Device (Maestro + adb): schedule a payment 20 min ahead, close the app, force WorkManager run
  (`adb shell cmd jobscheduler run -f …`), reopen → exactly one operation; reboot; force stop; time-zone
  change; battery saver on.
