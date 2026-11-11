// Updating exchange rates from the network. The application never depends on it: when every source
// fails, the rates stay what they were, the person is told when they were last updated, and every
// rate can still be edited by hand. Nothing here touches stored operations: an operation keeps the
// amounts it was saved with (domain/operations.ts), only future conversions use the new rates.
import type { Rates } from "../../domain/types.ts";
import type { Fetcher, RateProvider, RateQuote } from "./providers.ts";

// What the last update did, kept in the settings (`rateUpdate`).
export interface RateUpdateState {
  at: string; // when it was tried
  ok: boolean;
  // Per currency: which source gave it and the rate it gave (to compare the next answer with).
  sources: Record<string, { provider: string; rate: number; asOf: string | null }>;
  errors: { provider: string; message: string }[];
}

export interface RateChange {
  code: string;
  from: number;
  to: number;
  provider: string;
}

export interface MergeResult {
  rates: Rates;
  changed: RateChange[];
  skipped: { code: string; reason: "kept by hand" | "suspicious jump" }[];
  sources: RateUpdateState["sources"];
}

// A new rate more than this many times away from the previous answer of a source is not taken: it
// is more likely a wrong answer than a real move. The person can still type it by hand.
const MAX_JUMP = 3;

// Merges answers into the rate table. Earlier answers win; currencies the person keeps by hand are
// left alone; KGS is always 1 (the unit of the table). Pure.
export function mergeQuotes(current: Rates, quotes: readonly RateQuote[], keptByHand: readonly string[], previous: RateUpdateState["sources"] = {}): MergeResult {
  const rates: Rates = { ...current, KGS: 1 };
  const changed: RateChange[] = [];
  const skipped: MergeResult["skipped"] = [];
  const sources: RateUpdateState["sources"] = { ...previous };
  const done = new Set<string>(["KGS"]);
  for (const quote of quotes)
    for (const [code, rate] of Object.entries(quote.kgsPerUnit)) {
      if (done.has(code) || !(code in current)) continue;
      done.add(code);
      if (keptByHand.includes(code)) {
        skipped.push({ code, reason: "kept by hand" });
        continue;
      }
      const before = previous[code]?.rate;
      if (before && (rate / before > MAX_JUMP || before / rate > MAX_JUMP)) {
        skipped.push({ code, reason: "suspicious jump" });
        continue;
      }
      const rounded = Number(rate.toPrecision(6));
      sources[code] = { provider: quote.provider, rate: rounded, asOf: quote.asOf };
      if (rates[code] !== rounded) changed.push({ code, from: rates[code] ?? 0, to: rounded, provider: quote.provider });
      rates[code] = rounded;
    }
  return { rates, changed, skipped, sources };
}

export interface RefreshOptions {
  providers: readonly RateProvider[];
  fetcher: Fetcher;
  current: Rates;
  keptByHand: readonly string[];
  previous?: RateUpdateState | null;
  now: () => string;
  timeoutMs?: number;
}

// Asks the sources in order (each with its own time limit) until every currency of the table is
// covered or no source is left. Never throws: failures are part of the result.
export async function refreshRates(o: RefreshOptions): Promise<MergeResult & { state: RateUpdateState }> {
  const quotes: RateQuote[] = [];
  const errors: RateUpdateState["errors"] = [];
  const wanted = Object.keys(o.current).filter((c) => c !== "KGS" && !o.keptByHand.includes(c));
  const covered = new Set<string>();
  for (const provider of o.providers) {
    if (wanted.every((c) => covered.has(c))) break;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), o.timeoutMs ?? 8000);
    try {
      const quote = await provider.fetchQuote(o.fetcher, controller.signal);
      quotes.push(quote);
      for (const code of Object.keys(quote.kgsPerUnit)) covered.add(code);
    } catch (error) {
      errors.push({ provider: provider.id, message: controller.signal.aborted ? "timeout" : error instanceof Error ? error.message : String(error) });
    } finally {
      clearTimeout(timer);
    }
  }
  const merged = mergeQuotes(o.current, quotes, o.keptByHand, o.previous?.sources ?? {});
  return { ...merged, state: { at: o.now(), ok: quotes.length > 0, sources: merged.sources, errors } };
}

// Is it time to ask again? Sources update once a day; asking more than every 12 hours only risks
// being rate-limited.
export const shouldRefresh = (state: RateUpdateState | null | undefined, nowMs: number, everyHours = 12): boolean =>
  !state || nowMs - Date.parse(state.at) >= everyHours * 3600_000;
