// Exchange rates from the network: each source is read correctly, the next source steps in when one
// fails or is slow, currencies kept by hand are not touched, wild answers are not taken, and nothing
// breaks when every source is gone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultRates } from "../src/domain/currencies.ts";
import { currencyApiProvider, erApiProvider, nbkrProvider, parseCurrencyApi, parseErApi, parseNbkr, type Fetcher } from "../src/services/rates/providers.ts";
import { mergeQuotes, refreshRates, shouldRefresh } from "../src/services/rates/refresh.ts";

const ER = JSON.stringify({ result: "success", base_code: "USD", time_last_update_unix: 1762819201, rates: { USD: 1, KGS: 87.45, EUR: 0.86, THB: 32.5 } });
const CUR = JSON.stringify({ date: "2026-11-11", usd: { usd: 1, kgs: 87.4, eur: 0.861, gbp: 0.76, thb: 32.4 } });
const NB = `<?xml version="1.0" encoding="windows-1251"?><CurrencyRates Name="Daily Exchange Rates" Date="11.11.2026"><Currency ISOCode="USD"><Nominal>1</Nominal><Value>87,4500</Value></Currency><Currency ISOCode="KZT"><Nominal>1</Nominal><Value>0,1720</Value></Currency></CurrencyRates>`;

const fetcherFor = (answers: Record<string, string | number | "hang">): Fetcher => async (url, { signal }) => {
  const key = Object.keys(answers).find((k) => url.includes(k));
  const answer = key ? answers[key] : 404;
  if (answer === "hang")
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
  if (typeof answer === "number") return { ok: false, status: answer, text: async () => "" };
  return { ok: true, status: 200, text: async () => answer as string };
};

test("each source's answer becomes KGS per unit", () => {
  const er = parseErApi(ER);
  assert.equal(er.kgsPerUnit.USD, 87.45);
  assert.ok(Math.abs((er.kgsPerUnit.EUR ?? 0) - 87.45 / 0.86) < 1e-9);
  assert.equal(er.asOf, "2025-11-11");
  const cur = parseCurrencyApi(CUR);
  assert.equal(cur.kgsPerUnit.USD, 87.4);
  assert.equal(cur.asOf, "2026-11-11");
  const nb = parseNbkr(NB);
  assert.deepEqual(nb.kgsPerUnit, { KGS: 1, USD: 87.45, KZT: 0.172 });
  assert.equal(nb.asOf, "2026-11-11");
  assert.throws(() => parseErApi(JSON.stringify({ result: "error" })));
  assert.throws(() => parseCurrencyApi(JSON.stringify({ usd: { eur: 1 } })), /no KGS/);
});

test("when the first source fails, the next one fills the table; currencies kept by hand stay", async () => {
  const current = defaultRates();
  const result = await refreshRates({
    providers: [erApiProvider, currencyApiProvider, nbkrProvider],
    fetcher: fetcherFor({ "open.er-api.com": 500, jsdelivr: CUR, "nbkr.kg": NB }),
    current,
    keptByHand: ["EUR"],
    now: () => "2026-11-11T06:00:00.000Z",
  });
  assert.equal(result.state.ok, true);
  assert.equal(result.state.errors[0]?.provider, "er-api");
  assert.equal(result.rates.USD, 87.4, "from the second source");
  assert.equal(result.rates.EUR, current.EUR, "kept by hand");
  assert.equal(result.rates.KZT, 0.172, "filled in by the third source");
  assert.equal(result.rates.KGS, 1);
  assert.equal(result.sources.USD?.provider, "currency-api");
});

test("a mirror of the same source is tried before giving up on it", async () => {
  const result = await refreshRates({
    providers: [currencyApiProvider],
    fetcher: fetcherFor({ jsdelivr: 503, "pages.dev": CUR }),
    current: defaultRates(),
    keptByHand: [],
    now: () => "2026-11-11T06:00:00.000Z",
  });
  assert.equal(result.rates.GBP, Number((87.4 / 0.76).toPrecision(6)));
});

test("a slow source is cut off by its time limit and the next one answers", async () => {
  const result = await refreshRates({
    providers: [erApiProvider, nbkrProvider],
    fetcher: fetcherFor({ "open.er-api.com": "hang", "nbkr.kg": NB }),
    current: defaultRates(),
    keptByHand: [],
    now: () => "2026-11-11T06:00:00.000Z",
    timeoutMs: 50,
  });
  assert.equal(result.state.errors[0]?.message, "timeout");
  assert.equal(result.rates.USD, 87.45);
});

test("with every source gone nothing changes and the result says so", async () => {
  const current = defaultRates();
  const result = await refreshRates({
    providers: [erApiProvider, currencyApiProvider, nbkrProvider],
    fetcher: async () => {
      throw new Error("offline");
    },
    current,
    keptByHand: [],
    now: () => "2026-11-11T06:00:00.000Z",
  });
  assert.equal(result.state.ok, false);
  assert.equal(result.state.errors.length, 3);
  assert.deepEqual(result.rates, { ...current, KGS: 1 });
  assert.deepEqual(result.changed, []);
});

test("an answer far from the source's previous one is not taken", () => {
  const merged = mergeQuotes(
    { KGS: 1, USD: 87.5, EUR: 98 },
    [{ provider: "x", asOf: null, kgsPerUnit: { USD: 875, EUR: 99 } }],
    [],
    { USD: { provider: "x", rate: 87.4, asOf: null }, EUR: { provider: "x", rate: 98.1, asOf: null } },
  );
  assert.equal(merged.rates.USD, 87.5);
  assert.deepEqual(merged.skipped, [{ code: "USD", reason: "suspicious jump" }]);
  assert.equal(merged.rates.EUR, 99);
});

test("rates are asked for at most every 12 hours", () => {
  const at = "2026-11-11T00:00:00.000Z";
  assert.equal(shouldRefresh(null, Date.parse(at)), true);
  assert.equal(shouldRefresh({ at, ok: true, sources: {}, errors: [] }, Date.parse(at) + 3600_000), false);
  assert.equal(shouldRefresh({ at, ok: false, sources: {}, errors: [] }, Date.parse(at) + 13 * 3600_000), true);
});
