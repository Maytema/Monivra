# Monivra (React Native + Expo)

The new application. The first application (repository root, Capacitor) stays the reference until this
one passes acceptance; see `docs/architecture/` and the checkpoint log `docs/architecture/MIGRATION_STATUS.md`.

| Where | What |
| ----- | ---- |
| `src/domain` | Money rules in pure TypeScript (ported from `js/domain`, checked against it by the parity tests) |
| `src/data` | SQLite schema, migrations, one transaction per change, verified import |
| `src/application` | The store: the only way to change the ledger |
| `src/services/rates` | Exchange-rate sources behind one interface, with fallback |
| `src/platform` | Phone capabilities: database, files, notifications, background task, lock, network |
| `src/features`, `src/app`, `src/ui` | Screens, routes, design tokens and components |
| `test` | `node --test test/*.test.ts` — no install needed (Node 22) |

Checks: `node --test test/*.test.ts`; `tsc -p tsconfig.core.json` (core without React Native);
`.github/workflows/mobile.yml` (types, tests, APK, emulator smoke test, results on branch `mobile-builds`).

Application id `app.monivra.finance.next`: installs next to the first application; data moves by a data
file (old app: More → Data → Save data file; new app: first start → Bring data from the old app).

## Adding an exchange-rate source

Write an object with `id`, `name`, `attribution` and `fetchQuote(fetcher, signal)` returning
`{ provider, kgsPerUnit, asOf }` in `src/services/rates/providers.ts`, add a parser test with a saved
answer, and put it in `RATE_PROVIDERS` where it should stand in the order. Nothing else changes: a source
that fails or is slow is skipped, the next one fills in, and the rates stay as they were if all fail.
