# Rules of the exports

What every figure of the Financial summary, the Detailed transactions report and the CSV file
means, and which operations they take. The rules are in `domain/report-model.js` (the summary and
the detailed report) and `data/csv.js` (the file); this page is what the checks in
`tests/report.test.js` hold them to. A figure that cannot be explained here must not be shown.

## The scope

The scope of an export is **the period and the filters** chosen on the Export page: dates,
accounts, categories (a debt account counts as a category when it is counted as income or expense),
types, tags and a text of the comment. An operation is in the scope when its date is in the period
and it passes every filter (`operationMatchesFilters`, the same function the operation lists use).

- A filter by accounts keeps an operation when **either** account of it is chosen.
- Archived accounts and categories are in the scope like any other; a report that lists accounts
  (balances) lists the archived ones only when they are chosen in the filter.
- Every report says its scope on its first page: the period, the filters, the day it was made.

## Flow and position

Two kinds of figure never mix:

- **Flow** (income, expenses, net, counts, categories, charts): worked out from the operations of the
  **whole scope** — period and every filter.
- **Position** (balances at the start and the end, savings, debts): a balance is a state, not a
  flow, so these follow **only the filter by accounts** and the end of the period. They do not
  change when a category or a tag is filtered. A note on the page says so when a filter is on.
  The balance of an account on a day is its opening balance plus every operation up to that day
  (`balanceOn`), so it does not depend on the filters or the period of the operations.
- Budgets are shown for their own period around the end of the report and follow no filter.

## What is income and what is an expense

Taken from the same rows as the statistics of the application (`reportRows` in `domain/finance.js`):

- an **income** operation is income, an **expense** operation is an expense;
- a **transfer between own accounts is neither**. This also holds for transfers into and out of
  savings accounts and for the two sides of an exchange between currencies;
- the exception is money moved to or from a **debt account that is set to count** as an expense or
  an income (`transferRoles`): paying a debt that is counted as an expense is an expense once; money
  received from a debt counted as an income is income once. The summary says the amount in a note;
- **adjustments** change a balance and are neither; they are listed apart ("Balance adjustments");
- **credit cards:** spending on a credit-limit account is an ordinary expense; paying the card from
  another account is a transfer and is not an expense a second time. The summary shows the card
  spending as a line of its own.

### Transfers when accounts are chosen

| Accounts chosen     | The transfer                                              | In the totals |
| ------------------- | --------------------------------------------------------- | ------------- |
| both accounts of it | "Transfers between your accounts" (inside the scope)      | not counted   |
| one of them         | "Transfers across the chosen accounts" (crosses the edge) | not counted   |
| neither             | not in the scope, not listed                              | not counted   |

Transfers to savings, from savings and to or from debt accounts are listed as their own movements
when both accounts are in the scope. A transfer between two currencies is listed in the currency
of the account it leaves.

## Currencies

- Every sum is kept **per currency of the account** and shown per currency. Currencies are never
  added together as if they were one.
- One figure in the main currency (the totals line, the category shares, the charts and the trend)
  is worked out with the **exchange rates set in the application** (the fixed rates of
  More → Settings), and is marked "converted" together with the rates used. No rate is ever
  invented, and a currency with no rate cannot be stored in the data at all.
- The trend of the balance converts every balance at **today's** rates, not at the rates of the
  past; the report says so.
- A transfer between two currencies keeps both amounts as they were entered; the detailed report
  shows both sides.

## The Financial summary

| Part               | What it is                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| Overview           | Income, expenses and net (income − expenses) per currency, the number of operations by type      |
| Cash flow chart    | Income and expenses per day, week, month or year (the step that gives up to about 40 bars)       |
| Balance trend      | Balance of all counted accounts at the end of each step of the chart, in the main currency       |
| Expenses / incomes | Top-level categories (subcategories add to their parent), largest first, with the share of total |
| Accounts           | Opening and closing balance and the change, per account; "counted" accounts are the totals       |
| Other movements    | Transfers and adjustments, apart from income and expenses (see above)                            |
| Savings            | Savings accounts with a goal: balance, goal, what is left, the percent (`shownPercent`)          |
| Debts              | Debt accounts: who owes whom, the balance, the total, what is left                               |
| Budgets            | Spent and left in the period of each budget that ends at the end of the report                   |

A part with nothing to show (no savings with a goal, no budgets) is left out; it is never filled
with zeros. The parts of the summary can be turned off on the Export page.

## The Detailed transactions report

- Every operation of the scope, **once**, newest first, with the fields chosen on the page (date is
  always there).
- The totals line is the same income and expenses as the summary, per currency. With "Amount" turned
  off there are no totals.
- A note says that transfers between own accounts are not income or expenses and that adjustments
  are not counted.
- The header of the table is repeated on every page.

### Long text

The text of a cell is wrapped to the width of its column. A row that is taller than the rest of the
page is split between pages line by line (a short cell such as the amount is written on the first
part); the header is repeated.
A single cell longer than **6000 characters** is cut in the PDF with a note saying how much was left
out; the CSV file always holds the whole text. A word without spaces (a link) is broken at the edge
of the column. A tag longer than the column is wrapped the same way. No cell may overlap another or
leave the page, and one long comment never hides an amount.

## The CSV file

- UTF-8 with a byte order mark (so spreadsheets read Cyrillic), commas, quoted cells, lines
  ending in CRLF, a header row with the names of the columns:
  `type,date,amount,currency,from,to,category,comment,tags,to_amount,to_currency`.
- Only the fields chosen on the page are written (the date always is); the filters and the period
  are the same as for the PDF reports. The file is written from the operations of the scope with no
  conversion: the amount is in the currency of the account (`currency`).
- Income is written as it reached the account (after taxes and commissions). A transfer between
  two currencies has `to_amount` and `to_currency`.
- **Formula protection:** a cell that begins with `=`, `+`, `-`, `@`, a tab or a return gets a
  leading apostrophe, so a spreadsheet shows it as text. The import takes the apostrophe away again.
- The file written with all fields is read back by the import of this application as the same
  operations (all of them are then "already there").

## Preview

The preview of a PDF is the pages of the very file that is saved: the job (`data/report-job.js`)
draws the pages once from the report model and the preview, Save, Share and Print all use that
result. The preview of a CSV is a table of the first 20 rows with the number of all rows. Looking
at a preview never saves, shares or changes anything.
