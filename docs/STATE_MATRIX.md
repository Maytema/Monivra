# State matrix and what the checks cover

All checks: `tests/stress.test.js` (in-page, from sample data, disposable) plus the earlier suites.
Expected values are written separately in the test (`refCard`, `refRoles`, plain sums), never read
back from the code under test.

| Area | Dimensions (denominator) | Sampled |
|---|---|---|
| Card parts | 5 starts (own, zero, part, full, over) × 8 spends (incl. limit±1) = 40 | 40 / 40 |
| Card sequences | refund, top-up, edit, delete in 4! = 24 orders; parts asserted after each step | 24 / 24 |
| Card limit | below usage, to 0, back; balance and total unchanged | 1 sequence |
| Boundaries | balance = 0, = −limit, −limit−1 unit | 4 / 4 |
| Reload / backup | JSON round trip through `completeData`; limit and balance equal; CSV and report rows | 1 |
| Scheduled | before time, exact minute, day before; reopen after 3 days; daily catch-up; month end (31st); archived/empty source; unpostable item; pending cancel vs completed reversal; executed → future | 9 |
| Debt switches | 5 account pairs (regular→debt, debt→regular, debt→debt, card→debt, debt→card) × 4 switch states = 20; each posted, counted vs reference, reversed | 20 / 20 |
| Debt lifecycle | partial, settle, overpay, delete in reverse | 1 |
| Excluded | overall only; ops still in reports/CSV; toggle before/after | 2 |
| Currency | rounding once per amount; reversal; cross-currency transfer | 2 |
| Atomicity | four refused operations leave state unchanged | 1 |

Gaps: UI-driven flows for these sequences (only the card sheet is covered visually); DST (dates are
plain `YYYY-MM-DD` + `HH:MM` strings, so a clock change cannot move an occurrence, but a time that does
not exist that night is simply due at the next check); a fully closed browser (no server scheduler;
payments post at next opening); simultaneous devices posting the same occurrence (a restore that
brings an occurrence already posted is recognised by `fromSchedule`).
