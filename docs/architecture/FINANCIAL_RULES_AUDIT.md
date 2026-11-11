# Financial rules audit

Labels: see [README.md](README.md#evidence-labels-used-in-every-document). Nothing in the application was
changed. Where a rule is unclear it is listed as a question, not decided here.

Existing rule documents that this audit checked against the code: `docs/FINANCIAL_RULES.md`,
`docs/CREDIT_MODEL.md`, `docs/SCHEDULED_AND_NOTIFICATIONS.md`, `docs/EXPORT_RULES.md`.

## 1. Source of truth

| Figure                              | Stored, cached or derived?                                                        | Where computed                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Account balance                     | **Derived** on every call from `opening` + all operations                         | `finance.js accountBalance`; again in `report-model.js balanceOn` (dated) [V] |
| Overall / group totals              | Derived; each account converted at current rate, then summed                      | `finance.js overallBalance`; screens `accounts/list.js` [V]                   |
| Card parts (own, credit, available) | Derived from balance and limit                                                    | `finance.js cardState` [V]                                                    |
| Goal / debt / limit progress        | Derived                                                                           | `finance.js progressForBalance`, `domain/percent.js` [V]                      |
| Category totals                     | Derived from `reportRows` (main currency) or `categoryAmount` (category currency) | `finance.js categoryTotal`, `categoryTotalIn` [V]                             |
| Budget spent                        | Derived from `reportRows` of the period                                           | `domain/budgets.js budgetSpend` [V]                                           |
| Received amount of a transfer       | **Stored** (`receive`), computed at save time                                     | `operations.js validateOp` [V]                                                |
| Amount in a category's currency     | **Stored** (`categoryAmount`), computed at save time                              | `operations.js validateOp` [V]                                                |
| Net of fees                         | Derived for expenses; stored as `receive` for income with fees                    | `fees.js netAmount`, `validateOp` [V]                                         |
| Exchange rates                      | Stored, one current table, no history                                             | `appData.rates` [V]                                                           |

The ledger is **operations + opening balances**. No balance is ever stored, so editing or deleting any
past operation gives the same balance as replaying everything [T "Card: refund, top-up, edit and delete in
all 24 orders end in the same state"]. This is the strongest property of the current design and the new
architecture keeps it (PROPOSED_ARCHITECTURE §4).

## 2. Rules as implemented

### 2.1 Money and rounding

- Amounts are safe integers in **hundredths** for every currency, limit |x| ≤ 9·10¹² [V `evaluateExpression`].
- Conversion `round(n × rate(from) / rate(to))` with `Math.round` (half toward +∞, so −2.5 → −2) [V
  `convertCurrency`]; rates are "KGS per unit", missing rate counts as 1 [V `currencyRate`].
- Calculator: `+ − × ÷` with precedence, evaluated in floating point, rounded once to hundredths [V/T].
- Fees: applied in order; a deduction works on the running amount, an addition on the original; noise
  removed at 1e-6 then rounded; result ≥ 0 [V/T `fees.js`]. Fixed fee values are stored in major units
  (`value × 100`) [V].

### 2.2 Operations

- Income credits `to` with `amount` (or `receive` = net when it has fees); expense debits `from` with the
  full `amount`; transfer debits `amount` from `from` and credits `receive` to `to`; adjustment moves money
  between the account and an implicit "Adjustment" side in the main currency [V `validateOp`,
  `accountBalance`].
- A date after today (not an adjustment) is never an operation: it becomes a one-time scheduled payment
  [T]. A date more than a year away is confirmed first [T].
- Editing replaces the record; deleting removes it; there is no trash. Restoration exists only through the
  inner backups or a data file [V].

### 2.3 Accounts, cards, debts, savings

- New account with a balance → `adjustment` operation; debt → `opening` [T]. Balance edit → `adjustment`
  dated today [V].
- Card (Regular + limit): net ledger, overspending allowed [T, `docs/CREDIT_MODEL.md`].
- Debt: four independent switches; direction of a transfer decides expense/income; debt ↔ debt counts as
  nothing [T]. Overpayment flips the shown direction [T].
- Savings goal: progress = balance / goal; reached is decided on amounts, not on the rounded percent [D
  AGENTS.md, V `percent.js`].

### 2.4 Budgets and analytics

- Analytics rows = `reportRows`: adjustments excluded; expense counts **net of fees**; transfers count only
  through debt switches; everything converted to the main currency at the **current** rate [V].
- Budget spent = those rows of the budget's period, filtered by category (and subcategory), converted main
  → budget currency [V].

### 2.5 Scheduled payments

- Exactly-once per occurrence via `fromSchedule {id, date}` lookup [T, incl. the test added 2026-11-11];
  posting on the due day with the due time; far-behind payments (> 31 occurrences or > 365 days) wait for
  the person; monthly rules keep `anchorDay` [T]. Not executed while the app is closed [V].

## 3. Findings

Severity: **High** = can change money figures without the person asking; **Medium** = figures can differ
between screens or drift; **Low** = edge case or hygiene.

| ID      | Sev    | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Evidence                                                                                        |
| ------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **F-1** | High   | **Saving an unrelated change re-prices a cross-currency amount.** `validateOp` recomputes `receive` (transfers) and `categoryAmount` (income/expense in a category of another currency) at the current rate unless the draft says `receiveManual`. Stored transfers do not keep that flag, so `applyBulkChanges` (e.g. "add tag") and editing a transfer that has a fee recompute them. Probe on 2026-11-11: transfer 8,750.00 KGS → 100.00 USD; rate USD edited 87.5 → 100; bulk "add tag trip" → received becomes **87.50 USD** and the USD account balance drops by 12.50. Transfer with 1 % fee: comment edit after the same rate change, 99.00 → **86.63 USD**. | [V] probe script (domain functions called directly; editor UI path for the fee case not driven) |
| F-2     | Medium | Two implementations of the balance formula (`accountBalance`, `balanceOn`). Identical today; any future change must be made twice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | [V]                                                                                             |
| F-3     | Medium | History is re-valued at current rates: changing a rate changes past totals, statistics, budgets and reports. Category tiles in their own currency keep "as entered" amounts (`categoryTotalIn`), so a category tile and the statistics can disagree after a rate edit. Documented as intended for categories; not documented for reports/budgets.                                                                                                                                                                                                                                                                                                                    | [V] [Q-F1]                                                                                      |
| F-4     | Medium | Budget spent is converted twice (account → main, then main → budget), rounding each row twice; a budget in the account's currency can differ from the plain sum by up to about one minor unit per row.                                                                                                                                                                                                                                                                                                                                                                                                                                                               | [V] `budgets.js budgetSpend`                                                                    |
| F-5     | Medium | Every currency uses hundredths. JPY/KRW (0 decimals) and KWD/BHD/OMR (3 decimals) are stored and shown with two decimals; any future change of exponent re-interprets stored data.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | [V] [Q-F2]                                                                                      |
| F-6     | Medium | The fee of an **expense** appears in no expense total: the account pays `amount`, the category and all analytics count the net. Total expenses < money that left the accounts. Tested as the intended rule ("the account pays in full, the category … get the rest"), but its reporting consequence is not documented.                                                                                                                                                                                                                                                                                                                                               | [T] [Q-F4]                                                                                      |
| F-7     | Medium | Deleting an account deletes its transfers too, so **another account's balance changes**; deleting a category deletes its operations. Both ask for confirmation; neither makes a safety backup (restore and "delete data" do).                                                                                                                                                                                                                                                                                                                                                                                                                                        | [T] [Q-F3]                                                                                      |
| F-8     | Medium | Commands mutate the global object in place. Most validate first, but `storeCategory` (`Object.assign` before sub-actions), budget save in the screen, and `storeAccount` (saved later by `finishFlow`) can leave memory half-changed if an exception occurs mid-way; the next save would persist it. No case was found that throws there today.                                                                                                                                                                                                                                                                                                                      | [V]                                                                                             |
| F-9     | Low    | Statistics card "Scheduled expenses/incomes/transfers" is summed in the screen from `amount` (no fees, no category currency).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | [V] `screens/statistics.js` line 140                                                            |
| F-10    | Low    | `Math.round` is asymmetric for negative halves (balances converted for totals).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | [V]                                                                                             |
| F-11    | Low    | Local-time model: "today" and due times follow the phone's time zone; travelling across zones moves due moments. Daily auto-backup uses the UTC day.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | [V]                                                                                             |
| F-12    | Low    | In a browser, two tabs each save the whole document: last write wins, the other tab's changes are lost. Not possible in the Android shell (one WebView).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | [V] by design of `save()`; [A] not tested                                                       |
| F-13    | Low    | Exactly-once for scheduled payments relies on scanning operations, not on a constraint; it holds because all writers go through `postOccurrence`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | [V]                                                                                             |
| **F-14** | High  | **Changing one account's currency with "convert everything" changes other accounts.** `planCurrencyChange` (mode `all`) converts every `adjustment` operation of every account (its branch has no check that the operation belongs to the account) and counts scheduled payments in the rounding correction of the opening balance. Probe 2026-11-11 on the sample data: another account's correction of 1,000.00 KGS became 11.43 (its balance 2,200.00 → 1,211.43 KGS); the changed account ended at 705.33 USD instead of 211.05. Found while porting; fixed in the new application (MIGRATION_STATUS). | [V] probe on the old code |

## 4. Guarantees the new architecture must give (and how)

| Guarantee                     | Mechanism (details in PROPOSED_ARCHITECTURE / DATA_MIGRATION_PLAN)                                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Atomic financial operations   | Every command = one SQLite transaction through a single serialized writer; validation before `BEGIN`; nothing in memory is the source of truth.                |
| Consistent calculations       | One balance definition (SQL view + the same rule in a pure TS function used by tests as the oracle); no screen computes money.                                 |
| Transactional updates         | Operation, schedule advance, audit/outbox row written in the same transaction.                                                                                 |
| Idempotency                   | `UNIQUE(schedule_id, occurrence_date)` on operations; deterministic occurrence id (UUIDv5 of schedule id + date) so device, background and server agree.       |
| Reliable editing/deletion     | Stored amounts are facts: re-pricing only when the person changes an amount, account or currency (fixes F-1); soft delete with tombstones (for sync and undo). |
| Duplicate prevention          | Primary keys are UUIDs; imports carry a source fingerprint; merge identity stays the record id (as today).                                                     |
| Recovery from partial failure | Transactions roll back; migrations run in a transaction with a pre-migration copy of the database file; data file export always available.                     |
| Consistent reporting          | Reports, budgets and statistics read the same `report_rows` query; currency conversion policy written down (Q-F1) and applied in one function.                 |
| Concurrent operations         | Single writer queue in-process; WAL + `busy_timeout` against a background task's connection; sync applies remote changes through the same commands.            |

## 5. Before changing any rule

Rules F-1 and F-3–F-7 are product decisions or defects that must be decided by the owner (OPEN_QUESTIONS
Q-F1…Q-F5). The migration reproduces current behaviour first (parity), **except** F-1, which is a defect:
the recommendation is to add a failing regression test and fix it in the current app before parity
fixtures are frozen, so the new app is not built to match a defect. This audit did not change it.

## Appendix: probe used for F-1

Save as `probe.mjs` in the repository root and run `node probe.mjs` (uses the test server and sample fixture; changes
only an in-page copy of the data):

```js
import { chromium } from "playwright";
import { serveApp } from "./tests/server.mjs";
const { server, address } = await serveApp();
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${address}/index.html`);
const out = await page.evaluate(async () => {
  const st = await import("/js/core/state.js");
  const { createSampleData } = await import("/tests/fixtures/sample-data.js");
  const ops = await import("/js/domain/operations.js");
  const fin = await import("/js/domain/finance.js");
  const user = st.appData;
  const r = {};
  try {
    st.setAppData(createSampleData());
    const d = st.appData;
    d.accounts.push({ ...d.accounts[0], id: "usd", name: "USD", currency: "USD", opening: 0 });
    // transfer 8750.00 KGS -> USD, receive computed at rate 87.5 -> 100.00 USD
    const t = ops.putOperation({
      type: "transfer",
      from: d.accounts[0].id,
      to: "usd",
      amount: 875000,
      date: "2026-11-01",
      comment: "",
      tags: [],
    });
    r.receiveAtCreate = d.ops.find((o) => o.id === t.id).receive;
    r.receiveManualStored = d.ops.find((o) => o.id === t.id).receiveManual;
    r.usdBefore = fin.accountBalance("usd");
    d.rates.USD = 100; // the person edits the rate later
    ops.applyBulkChanges([t.id], { ...ops.emptyBulkChanges(), addTags: ["trip"] });
    r.receiveAfterBulkTag = d.ops.find((o) => o.id === t.id).receive;
    r.usdAfter = fin.accountBalance("usd");
    // same with a fee, edited through putOperation (editor path keeps receiveManual only without fees)
    d.rates.USD = 87.5;
    const f = ops.putOperation({
      type: "transfer",
      from: d.accounts[0].id,
      to: "usd",
      amount: 875000,
      date: "2026-11-02",
      comment: "",
      tags: [],
      fees: [{ kind: "commission", percent: 1, value: 0, add: false }],
    });
    r.feeReceiveAtCreate = d.ops.find((o) => o.id === f.id).receive;
    d.rates.USD = 100;
    const edited = { ...d.ops.find((o) => o.id === f.id), comment: "edited" };
    ops.putOperation(edited);
    r.feeReceiveAfterCommentEdit = d.ops.find((o) => o.id === f.id).receive;
  } finally {
    st.setAppData(user);
  }
  return r;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
server.close();
```

Output on 2026-11-11: `{"receiveAtCreate":10000,"usdBefore":10000,"receiveAfterBulkTag":8750,"usdAfter":8750,"feeReceiveAtCreate":9900,"feeReceiveAfterCommentEdit":8663}`.
