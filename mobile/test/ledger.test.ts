// The balances around a period (the header of the operations list): the one-pass sum gives what adding every
// operation account by account gives.
import { test } from "node:test";
import assert from "node:assert/strict";
import { balancesAround } from "../src/domain/ledger.ts";
import { convert } from "../src/domain/money.ts";
import type { LedgerData } from "../src/domain/types.ts";
import { fixture } from "./support/helpers.ts";

// The plain way: every counted account, every operation up to the day.
function plain(data: LedgerData, accounts: string[] | null, date: string, exclusive: boolean): number {
  return data.accounts
    .filter((a) => a.include && !a.archived && (!accounts || accounts.includes(a.id)))
    .reduce((sum, a) => {
      const own = a.opening + data.ops.filter((o) => (exclusive ? o.date < date : o.date <= date)).reduce((n, o) => n + (o.to === a.id ? (o.receive ?? o.amount) : 0) - (o.from === a.id ? o.amount : 0), 0);
      return sum + convert(own, a.currency, data.settings.currency, data.rates);
    }, 0);
}

test("opening and closing balance of a period equal the account-by-account sums", () => {
  const data = fixture("sample");
  const days = [...new Set(data.ops.map((o) => o.date))].sort();
  const from = days[Math.floor(days.length / 3)]!;
  const to = days[Math.floor((days.length * 2) / 3)]!;
  for (const accounts of [null, [data.accounts[0]!.id], [data.accounts[1]!.id, data.accounts[3]!.id]]) {
    const { opening, closing } = balancesAround(data, accounts, from, to);
    assert.equal(opening, plain(data, accounts, from, true));
    assert.equal(closing, plain(data, accounts, to, false));
  }
  // The whole of time: nothing before it, everything at its end.
  const all = balancesAround(data, null, "0000-01-01", "9999-12-31");
  assert.equal(all.opening, plain(data, null, "0000-01-01", true));
  assert.equal(all.closing, plain(data, null, "9999-12-31", false));
});
