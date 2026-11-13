# 0003 — No platform formatting or collation in code that runs per row

**Decision.** Code that runs for every row, amount or frame does not call `toLocaleString`,
`toLocaleDateString`, `Intl.*` or `localeCompare`. Money: `domain/money.ts formatNumber` (integer
arithmetic); plain numbers and percents: `ui/number-text.ts`; week days and months: `i18n/index.ts`;
currency names and signs: generated tables `i18n/names.ts`, `i18n/signs.ts`; sorting: plain comparison of
ISO dates, ids and normalised names.

**Why (measured).** On the CI emulator (Hermes) 200 calls of `toLocaleString` with options took 290–880 ms
and 200 `toLocaleDateString` 260–880 ms (first and later runs in each app start); the same 200 amounts
with integer arithmetic take about 1 ms (`perf.txt` of builds 29–36). Every row of every list formatted amounts and dates this way.

**Check.** `mobile/test/format.test.ts` compares `formatNumber` with the platform's formatting on thousands
of amounts and every separator setting.
