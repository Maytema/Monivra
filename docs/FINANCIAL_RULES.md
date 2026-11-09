# Financial and platform rules (pre-merge audit)

What the application does, decided from the existing model, and what it cannot do in a browser.
Each rule has a check in `tests/premerge.test.js` (domain) or `tests/scenarios.mjs` (browser).

## Operations dated ahead and behind

- A date after today (not an adjustment) never becomes a done operation. `putOperation` turns it into a
  one-time scheduled payment (`recur: null`); until its day it changes no balance, report, budget or
  statistic. A date in the past is done at once and keeps its own date and period.
- **One scheduling engine.** `domain/scheduled.js` posts what came due: once per occurrence (the
  operation remembers `fromSchedule: { id, date }`, so reopening, a second device or a restore cannot post
  it twice), on the day it was due. A payment far behind (31 occurrences or a year) waits for an answer.
- **Files.** An operation dated ahead that arrives in `ops` from a backup, a restore or an older version
  moves to the scheduled payments the next time payments are posted (`planFutureOperations`). A CSV row
  dated ahead is added as a scheduled payment (the import says how many); undoing the import takes it away.
- **When it runs.** At start, when the app is looked at again and once a minute while it is open. A closed
  browser runs nothing: payments that came due meanwhile are posted at the next start, each once, dated
  on its own day. Posting at the exact time with the app closed needs a server or the native app.
- Dates are local calendar days (`today()` is read when needed, not once at load, so an app left open past
  midnight uses the new day). A scheduled payment is posted on its day whatever its time of day.

## Card limit (a regular account with a limit)

One number is kept: the **balance**. Credit used = what the balance is below zero; own funds = what it is
above zero; available = balance + limit. The limit is a target, not part of the balance.

- The used share is `max(0, −balance) / limit`: a card with its own money shows 0 %, never a negative
  share (S-02 fixed). Beyond the limit the share passes 100 % and the sheet says "Limit exceeded by …".
- **Not changed (existing product behaviour, documented):** spending beyond the limit is allowed (an
  overdraft in the same balance), nothing blocks it, and a repayment is a transfer to the card.

## Debt accounts

Four independent switches: _Show in expenses / income_ only decide whether the account is shown among the
category tiles; _Consider as expense / income_ decide how transfers count in reports:

- money **paid into** a debt account counts as an expense when _Consider as expense_ is on;
- money **taken out of** a debt account counts as an income when _Consider as income_ is on;
- a transfer between two debt accounts, or two regular accounts, counts as nothing.
  The direction of the transfer decides, so both switches on never make one event both. Tested over the
  whole matrix of switches and directions, with partial repayments, overpayment (the direction of the debt
  turns round, the classification does not), edit and delete.

## Accounts excluded from the overall balance (F-01)

_Include in overall balance_ decides only the **balances that add accounts up**: the headline total and
the Total tab of Accounts (which now says how many accounts it leaves out; it used to add every account).
Operations of an excluded account stay in the history, the analytics, budgets and reports; reports mark
such accounts with \* and list them. An export can include them through the account filter.

## Rounding (B-04)

Money is integer minor units; a conversion rounds half up once per amount. Changing the currency of an
account with "convert everything" converts each amount, then moves the leftover rounding into the opening
balance, so the new balance is exactly the old balance converted at the rate (tested on 40 accounts).
Editing or deleting an operation removes exactly the stored integers, so it adds no drift. A round trip
through another currency and back may differ from the original by a few minor units (inherent to rounding).

## PDF and CSV totals (the 955,115 and 975,115 KGS)

Not a calculation error: the CSV lists the raw operations; the reports add what the accounts say counts as
an expense or an income. The difference was a 20,000 KGS transfer to a debt account with _Consider as
expense_. Now the file and the report both say so: the CSV has a `counted_as` column (the import ignores
it), the detailed report names such rows "Transfer · counted as expense" and adds a note. A test adds up
the CSV with `counted_as` and gets exactly the totals of the detailed report.

## Merging a backup

A backup has no time of editing, so neither version of a record that is in both can be called newer.
Merge now keeps **the version on this device** by default, and says how many records differ (with the list on
demand); one tap chooses "Use the backup's version" instead (the former behaviour, still available to the
engine as `conflicts: "backup"`). Records that exist only in the backup are added, with the accounts they
need. Merging the same backup twice changes nothing. A safety backup is made before every restore.

## CSV duplicates

Two identical-looking operations are different operations: a file's rows are kept as many times as the data
lacks them (importing a file twice adds nothing; two real coffees on one day are both kept). The preview
says how many repeat rows there are and how many are left out as already present.

## PIN

Only a salted PBKDF2-HMAC-SHA256 hash (20,000 rounds) of the PIN is stored (`platform/pin.js`), so backups
and exports no longer contain the digits. An earlier plain PIN is converted when the data loads and in saved
backups. Five wrong PINs in a row make the keys wait (30 s, doubling to 8 min). This is a **screen lock**:
the data in the browser storage is not encrypted, and a 4 or 6 digit PIN can be guessed from its hash by
anyone holding the file. A forgotten PIN cannot be reset inside the app (clear the site data, or restore a
data file afterwards).

## Notifications and native capabilities

| Capability                                                               | State                                                                                                                  |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| In-app reminder messages                                                 | works while the app is open                                                                                            |
| System notifications (Notification API + minimal service worker `sw.js`) | works where the browser allows and the app is open or in the background; verified by mock only, UNVERIFIED on a device |
| Reminders of scheduled payments, periodic reminder (time, days)          | implemented (`domain/reminders.js`), shown once each                                                                   |
| Reminders with the app closed                                            | impossible in the browser; needs push from a server or local notifications of a native app                             |
| Test notification                                                        | real: sends a system notification, or shows the reminder in the app when blocked                                       |
| Biometric unlock                                                         | not available, no pretending (`platform/biometric.js` is the boundary a native shell fills)                            |
| Native sharing                                                           | web share sheet where the browser supports the file type; JSON falls back to Save                                      |
