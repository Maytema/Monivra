# The Data section

More → Data holds five pages: **Saved backups**, **Data file**, **Import data**, **Export data**
and **Delete my data**. This page says what each does, what it checks, and what can go wrong. The
rules of the figures in the exports are in [EXPORT_RULES.md](EXPORT_RULES.md).

## Four words that always mean the same

| Word        | What happens                                                                                                                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Save**    | The file is written to the downloads of the device (`saveFile`).                                                                                                                                           |
| **Share**   | The share sheet of the device opens with the real file attached (`navigator.share`). Nothing is saved. Where the browser cannot send files the person is told, and saving is offered as a separate button. |
| **Print**   | The print dialog opens with the pages (PDF reports only). Printing does not save a file.                                                                                                                   |
| **Preview** | The result is shown inside the application. Nothing is saved, shared or changed.                                                                                                                           |

The code is `platform/files.js` (the browser calls) and `ui/file-actions.js` (the wording and the
dialogs). A native shell replaces `platform/files.js`.

**JSON and the share sheet.** Chromium hands only some kinds of files to the share sheet (PDF, CSV, text,
pictures); `canShare` is false for `application/json`. The backup file is **never** renamed (no `.txt`, no
double extension) and never sent as plain text. When the browser cannot share it, Share shows a short
message ("Sharing this backup isn't available in your browser. Save the .json file, then share it from
your phone's Files app.") with an explicit **Save file** button. Nothing is downloaded until that button is
tapped. Saving always writes the original `.json`, `.csv` or `.pdf`. Restoring accepts `.json` files.

**Native shell.** All browser calls for files are in `platform/files.js` (`makeFile`, `saveFile`,
`pickFile`, `canShareFile`, `shareFile`, `printPages`); `ui/file-actions.js` only decides wording and
dialogs from the results `shared / cancelled / unsupported / blocked / failed`. A React Native/Expo
adapter must provide the same functions; web sharing code is not assumed to carry over.

**Verified and not verified.** The tests run in a desktop Chromium with `navigator.share` replaced by a
stand-in that records the files it is given, so that Share is proven to hand over the real file and
to save nothing. The real share sheet of Android or iOS has **not** been exercised on a device.

## Saved backups

A backup is a copy of all the data kept inside the data (`backups`, the ten latest). It holds
accounts, categories and subcategories, operations, tags, scheduled payments, budgets, settings,
exchange rates and every id (`domain/backups.js`, `dataSnapshot`). Backups do not hold other backups.

- Made automatically once a day when "Save locally" is on, by hand ("Create a backup"), and before
  a change that cannot be undone ("Backup before a change": a restore, an import, a deletion).
- A backup opens a page with when it was made, the format version, the build, what it holds
  (counted, with the kinds of accounts and the currencies) and **what each way of restoring would do**.

### Restoring: one engine

Backups and data files are restored by the same code (`domain/restore.js`, `planRestore`;
`restoreData` in `domain/backups.js`). It works the result out first, checks the whole result with
`findDataProblem`, and only then changes anything.

**Replace data.** The data becomes exactly the backup, with its settings and exchange rates. The page
shows what the data holds now and what it will hold.

**Merge data.** The backup is added to the data:

- records are matched by **id**; where both have the id the **backup's version wins**, records only
  one side has stay; so a backup merged twice adds nothing the second time;
- the settings of this device and its exchange rates win; the backup only adds currencies this
  device has no rate for;
- tags are united;
- the page counts, per list, what is new, what is updated from the backup and what is already
  there. It also warns about records that **look** the same (same day, amount, accounts, category
  and comment) under another id, and about accounts with the same name and currency: they are
  added as separate records, never dropped silently.

**Scheduled payments.** The person chooses what happens to the scheduled payments of the backup:

| Choice             | Effect                                                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Count and schedule | What came due since the backup was made is added as operations; repeating ones go on                                                                                       |
| Skip and schedule  | What came due since is let go (not added); repeating ones go on                                                                                                            |
| Do not restore     | The scheduled payments of the backup are not taken; the current ones stay (in a replace, those pointing at accounts or categories the backup lacks are let go and counted) |

**Safety.** Every restore asks to confirm and makes a "Backup before a change" first. If the result
is not valid data (a reference to something that is not there, a category inside a subcategory…) the
button is disabled and the page says why. If the data cannot be stored (the storage is full) the data
stays as it was and a sentence says nothing was changed.

## Data file

A JSON file with everything (the same as a backup, plus `meta`: application, build, day written),
named `monivra-backup-YYYY-MM-DD.json`. **Share** and **Save** work as described above.
**Restore from file** opens the file chooser, reads the file and opens the same page as a backup,
with its facts and the two ways to bring it back.

A file is untrusted input (`data/backup-file.js`):

- over 20 MB, empty, not JSON, not an object, `schema` newer than this version → refused with a
  sentence for the person;
- nesting deeper than 12 levels or more than four million objects → refused;
- the names `__proto__`, `constructor` and `prototype` anywhere → refused, so nothing can reach the
  prototype of an object;
- only the known parts are read (unknown keys are not taken over); content is never evaluated;
- the whole file is validated like the stored data: every id unique, every reference in operations,
  scheduled payments and budgets pointing at an account or category that exists, amounts safe
  integers, dates real, currencies with a rate, categories at most two levels deep.

## When the stored data cannot be read

If what is stored on the device is damaged or not valid, the application does **not** replace it
with new data (it used to). `screens/recovery.js` opens instead of the application and says what is
wrong. The stored text is not changed. The person can save or share a copy of it, restore the newest
valid backup kept inside it, restore from a data file, or start with empty data (a copy of the
damaged text stays in the browser under the key `…damaged`). While the problem stands nothing is
written over the stored text (`save()` refuses).

## Import data (CSV)

Import adds operations from another application. It is a wizard (`screens/import-wizard.js`,
`data/csv-import.js`): **choose the file → match the columns → match accounts and categories →
preview → confirm → result**. Nothing changes before the confirmation.

- **View example** shows, inside the application, a table of sample rows, which columns are required
  and which optional, the formats of dates and amounts, currencies, how a transfer between currencies
  and an adjustment are written, and the limits. **Download template** saves an empty template or a
  template with a row of every kind of operation; both are accepted by the import.
- **The file:** UTF-8 (a byte order mark is removed; another encoding can be chosen when the text looks
  wrong), commas, semicolons or tabs, quoted cells with line breaks, empty lines skipped, up to
  100,000 rows and 20 MB, a cell up to 20,000 characters. A file that is not a table (unclosed quote,
  binary) is refused.
- **Columns:** guessed from the header (English and Russian names), shown for the person to change.
  Extra columns are ignored; a missing optional column is fine. Required: a date column, an amount
  column and a column for the account; without a type column the sign of the amount decides.
- **Dates:** the order (day.month.year, month/day/year, year-month-day) is guessed, and asked about
  when the file cannot tell; impossible dates (30 February) are refused.
- **Amounts:** read exactly. The last `.` or `,` is the decimal point when one or two digits follow;
  groups of three are thousands; "1,234" is told apart by the decimal sign chosen for the file; more
  than two decimals or text is a problem of that row. A number is never read as another number.
- **Type:** the type column, or the sign (a minus is an expense, a plus an income).
- **Accounts and categories** named in the file are matched by name to those that exist, or proposed
  as new (a currency that does not agree with the account is a problem of the row). The person can
  link each name to an existing account or category or let it be created.
- **Preview:** how many rows, how many will be added, how many are **already there** (duplicates),
  how many have problems (with the line and the reason, and a way to save the list of them), which
  accounts and categories would be created, and a sample of the operations. Warnings say when the
  dates may be read two ways or characters could not be read.
- **Duplicates:** an operation equal in type, date, amount, accounts, category and comment to one in
  the data is left out, counted **one for one**: if the file has the same row three times and the
  data one, two are added. So importing the same file again adds nothing.
- **Confirmation and safety:** the person confirms; "Backup before a change" is made; the result is
  checked as a whole and stored; if storing fails nothing is changed. The result page says what was
  added and offers **Take back this import**, which removes the operations it added, and the accounts, categories and tags it created, unless something
  else uses them by then.
- **Not partial by design:** rows with problems are left out and listed, the others are added in one
  step; there is no state in which half of the rows are in.
- Names from a file are only names (`__proto__` as an account name is a name).

## Export data

Three ways, each with its own settings, Preview, Share, Save (and Print for the PDFs):

| Way                         | Settings                             | File                                     |
| --------------------------- | ------------------------------------ | ---------------------------------------- |
| Financial summary (PDF)     | Period, filters, parts of the report | `monivra-financial-summary-<period>.pdf` |
| Detailed transactions (PDF) | Period, filters, fields              | `monivra-transactions-<period>.pdf`      |
| CSV file                    | Period, filters, fields              | `monivra-operations-<period>.csv`        |

Settings that do not belong to the chosen way are not shown. The meaning of every figure and the
filter rules are in [EXPORT_RULES.md](EXPORT_RULES.md).

**The PDF.** `data/report-layout.js` lays the report out on A4 pages as drawing commands.
`platform/report-render.js` draws them on a canvas for the preview and for printing, and
`platform/pdf.js` writes the PDF file from the **same commands** (no library, nothing leaves the device):
text is real, selectable and searchable text in an embedded Latin + Cyrillic font
(`platform/report-font.js`, `assets/fonts/`, licence in `assets/fonts/LICENSE.txt`), and the charts and
boxes are vector drawing. Save and Share hand over that file; Print opens the print dialog with the
page pictures and is separate from Save and Share. Details are in [EXPORT_RULES.md](EXPORT_RULES.md).

A report with hidden balances in the application still shows the real values (it is a file of
the person's own data); there is no switch for it.

## Delete my data

Four ways (`domain/deletion.js`, `screens/more/deletion-page.js`); each row says how much goes, and
the dialog says what it does to the rest.

| Way               | Removes                                                             | Stays                                                                      | Safeguards before                                        |
| ----------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------- |
| Delete operations | operations                                                          | accounts, categories, tags, budgets, scheduled payments, backups, settings | "Create a backup first" (on)                             |
| Partial deletion  | accounts, categories, operations, tags, scheduled payments, budgets | settings, exchange rates, backups                                          | backup (on) and "Save a data file first"                 |
| Delete backups    | the saved backups                                                   | all data                                                                   | –                                                        |
| Delete local data | everything including settings, reminders and the backups            | files saved outside the application                                        | "Save a data file first" and **writing the word DELETE** |

- Balances after deleting operations are the opening balances; goals, debts, credit limits and
  budgets are computed from the balances and operations, so they follow; nothing is left that points
  to a deleted record (checked by `findDataProblem` in the tests).
- The filters and the selection on the screen are reset, so they never point to deleted records.
- A deletion that cannot be stored changes nothing.
- Deleting operations or the finance data does **not** delete the backups: the copy made first is the
  way back (Saved backups → Replace data).
- Deleted data cannot otherwise be restored; the page says so.

## Checks

| What                                                               | Where                                             |
| ------------------------------------------------------------------ | ------------------------------------------------- |
| Backups, merge, replace, repeated merge, malformed files, rollback | `tests/restore.test.js`                           |
| Import: parsing, mapping, duplicates, rollback, large input        | `tests/import.test.js`                            |
| Report figures against a separate count, CSV, formula protection   | `tests/report.test.js`, `tests/report-fixture.js` |
| Deletion                                                           | `tests/deletion.test.js`                          |
| The screens: Save, Share, Preview, Print, Import, Recovery, Delete | `tests/scenarios.mjs`                             |
