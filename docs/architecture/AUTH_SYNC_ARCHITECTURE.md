# Authentication, cloud synchronization and subscriptions (design for later)

Labels: see [README.md](README.md#evidence-labels-used-in-every-document). **Nothing here is implemented
in v1**, and no backend is chosen: the goal is that adding these features later needs new modules, not a
restructure. Facts about stores and vendors are [D] (documentation/general knowledge, not re-checked in a
build) and must be re-checked when the work starts.

## 1. Four concerns, kept apart

| Concern             | Question it answers               | Lives in                                   | Works without the others?              |
| ------------------- | --------------------------------- | ------------------------------------------ | -------------------------------------- |
| **Ledger**          | What money did I record?          | Local SQLite (`data/`), always             | **Yes — always**                       |
| **Identity**        | Who am I to the server?           | `services/auth` + tokens in secure storage | Yes (sign-in without sync is possible) |
| **Synchronization** | Are my devices' ledgers the same? | `services/sync` + `outbox`/cursor tables   | Needs identity                         |
| **Entitlements**    | What am I allowed to use?         | `services/billing` + cached entitlement    | Yes (purchases without sync)           |

Signing in does not by itself sync anything; a subscription does not by itself sign anyone in. Each is a
port in `application/ports.ts` with a "not available" implementation in v1.

Modes the app supports: **offline/guest** (today, default, no account, full functionality of the
ledger), **signed in, sync off**, **signed in, sync on**. Losing network never blocks recording money.

## 2. What v1 must already do so this is additive [R]

1. Globally unique ids for new records (UUIDv7) and deterministic ids for scheduled occurrences (UUIDv5 of
   `schedule_id + occurrence_date`) — devices, background tasks and a server produce the same id.
2. `created_at` / `updated_at` on every syncable row; hard delete writes a `tombstone`.
3. All writes go through use cases and the single writer — the one place where an `outbox` row will be
   added later, in the same transaction.
4. Settings split into **device** settings (theme, lock, notification permission state, hide preview) and
   **ledger** settings (main currency, rates, month start…) — only the second kind would sync (Q-S3).
5. No `INTERNET` permission until the owner approves sync/auth.

## 3. Authentication options

| Method                     | Notes                                                                                                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email + password           | Needs reset by email, rate limiting, breached-password policy; most support burden                                                                                                                         |
| Email one-time code / link | No password to forget; needs reliable email delivery; good default for a finance app                                                                                                                       |
| Google                     | Android Credential Manager / Google identity; one tap on Android                                                                                                                                           |
| Apple                      | On iOS, App Review guideline 4.8 expects an equivalent privacy-focused login (in practice Sign in with Apple) when third-party/social login is offered, with exceptions [D — Apple guideline, see sources] |
| Guest                      | Today's mode; must stay; a later sign-in offers to **merge** guest data (reuse of the restore merge plan with preview)                                                                                     |
| Recovery                   | Provider recovery (Google/Apple) or email; the **local** ledger never depends on it                                                                                                                        |
| Account deletion           | In-app deletion of the server account and server data is required by both stores [D]; local data stays unless the person also deletes it; export offered first                                             |

Provider choice follows the backend choice (§4).

## 4. Backend and sync options (to compare in PoC P8, decision at C5)

| Option                                      | Shape                                                                                                                 | +                                                                                                     | −                                                                                                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Supabase + PowerSync**                    | Postgres + Auth + row-level security; PowerSync replicates Postgres ↔ client SQLite (open-source self-host or hosted) | Relational on both ends (matches our schema); RLS for ownership; offline-first client built on SQLite | Two services; sync rules must mirror our schema; vendor pricing; client may need its own SQLite binding — conflicts with `expo-sqlite` must be checked |
| **Supabase + own sync**                     | Postgres + Auth; our endpoint pushes the `outbox`, pulls changes since a cursor                                       | Full control; simple model (records are mostly append-only); one vendor                               | We write and maintain the protocol, conflict code and server jobs                                                                                      |
| **Firebase (Auth + Firestore)**             | Document DB with offline cache                                                                                        | Mature auth, offline cache built in                                                                   | Ledger becomes documents; aggregates and constraints weaker; record-level last-write-wins only; native SDKs in a dev build                             |
| **Own backend (e.g. Postgres + small API)** | Everything ours                                                                                                       | No vendor lock                                                                                        | Most work: auth, hosting, security, ops                                                                                                                |

Not considered: Realm/Atlas Device Sync (deprecated by MongoDB, 2024 [D]).

## 5. Sync semantics for a ledger [R]

- **Balances never sync** — they are derived, so devices cannot disagree about a balance once they agree
  about operations. This is the main reason to keep balances derived.
- **Operations**: mostly created once, sometimes edited, sometimes deleted. Conflict policy: last writer
  wins per record by a hybrid logical clock, and the losing version is kept in a local conflict log the
  person can restore from. A delete is a tombstone and competes by the same clock.
- **Scheduled occurrences**: two devices (or a device and a server) posting the same occurrence create the
  same id → converge to one row. A schedule's `next_date` merges as the maximum of both sides.
- **References to deleted records** (operation added offline to an account another device deleted): the
  sync applier runs the same domain checks; policy to decide — revive the account or move the operation to
  a "Recovered" account (Q-S2). Never drop it silently.
- **Category merge/move, account currency change**: replicated as the resulting record changes (not as
  commands), so replay order does not matter.
- **Duplicate prevention for imports**: an import batch id and per-row fingerprint; importing the same
  file on two devices yields duplicates only if the rows truly differ (today's rule).
- **Ownership and security**: every server row has `owner_id`; row-level security `owner_id =
auth.uid()`; one local database file per signed-in user (switching accounts never mixes ledgers).
- **End-to-end encryption** (optional, Q-S4): protects data from the operator but rules out server-side
  scheduled posting and server-side analytics.

## 6. Subscriptions and entitlements

- Digital features sold inside the app go through Google Play Billing / Apple In-App Purchase [D store
  policies].
- Options: RevenueCat (SDK + server-side receipt validation + entitlement API; revenue-share above a
  threshold) or direct store APIs (`react-native-iap`/`expo-iap`) plus our own validation server.
- Entitlement cached locally with expiry and an offline grace period; `useEntitlement("sync")` in UI;
  checks live in `services/billing`, never in domain code.
- Principles to confirm (Q-B1): the free tier keeps full local ledger and **export is never paywalled**;
  what is premium (sync, more backups, reports?) is a product decision; expiring a subscription never hides
  or deletes data.

## 7. Server-side scheduled execution (only with sync)

A server job can post due occurrences into the cloud ledger with the same deterministic ids; devices
receive them on next sync and also post locally if offline — the ids make both converge. Requires: sync,
no end-to-end encryption, server copy of rates and the same domain rules (shared TypeScript package or a
port). Details in BACKGROUND_EXECUTION §5.

## Sources

- [Apple Developer Forums: guideline 4.8 Login Services](https://developer.apple.com/forums/thread/765145)
- [PowerSync + Supabase integration guide](https://docs.powersync.com/integration-guides/supabase-+-powersync)
- [Expo: what synced in-app SQLite brings to Expo apps](https://expo.dev/blog/what-synced-in-app-sqlite-brings-to-expo-apps)
