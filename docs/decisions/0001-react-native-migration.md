# 0001 — React Native + Expo, the first application as the reference

**Decision.** The application is rebuilt in React Native + Expo + TypeScript in `mobile/` (branch
`rn-migration`, application id `app.monivra.finance.next`, installed beside the first application). The
first application (web + Capacitor) is not changed and is the reference for behaviour until the new one
passes acceptance.

**Why.** Native lists, gestures, notifications with the app closed, background posting, keystore and
biometrics, SQLite with transactions — see the audit [../architecture/AUDIT_SUMMARY.md](../architecture/AUDIT_SUMMARY.md)
and [../architecture/TECHNOLOGY_DECISIONS.md](../architecture/TECHNOLOGY_DECISIONS.md). Approved by the owner.

**Consequence.** Money rules are ported, not rewritten (`mobile/src/domain`), and checked against the first
application's code by `mobile/test/parity.test.ts`. Data moves by the data file v1.
