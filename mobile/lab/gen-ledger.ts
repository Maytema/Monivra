// A ledger of N operations over about 700 days (seeded), as JSON for the stand.
import { writeFileSync } from "node:fs";
import { addDays, systemClock } from "../src/domain/dates.ts";
import type { Operation } from "../src/domain/types.ts";
import { fixture } from "../test/support/helpers.ts";

const count = Number(process.argv[2] ?? 3000);
let seed = 7;
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const base = fixture("sample");
const pick = <T,>(l: readonly T[]): T => l[Math.floor(random() * l.length)]!;
const start = addDays(systemClock.today(), -700);
const ops: Operation[] = [];
for (let i = 0; i < count; i++) {
  const type = pick(["expense", "income", "expense", "transfer"] as const);
  const o: Record<string, unknown> = { id: `o${i}`, type, amount: 1 + Math.floor(random() * 500000), date: addDays(start, Math.floor(random() * 700)), comment: random() < 0.3 ? "Weekly groceries" : "", tags: [] };
  if (type === "expense") Object.assign(o, { from: pick(base.accounts).id, category: pick(base.categories).id });
  if (type === "income") Object.assign(o, { to: pick(base.accounts).id, category: pick(base.categories).id });
  if (type === "transfer") Object.assign(o, { from: pick(base.accounts).id, to: pick(base.accounts).id });
  ops.push(o as unknown as Operation);
}
writeFileSync(new URL("ledger.json", import.meta.url), JSON.stringify({ ...base, ops }));
