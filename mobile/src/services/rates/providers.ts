// Sources of exchange rates. Each source only knows how to ask and how to read its answer; it returns
// rates as "how many KGS one unit is worth" (the unit of the ledger's rate table). Adding a source is
// one object in this file and one entry in RATE_PROVIDERS; nothing else changes. A source that
// disappears simply fails, and the next one in the list is used.

export interface HttpResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}
export type Fetcher = (url: string, init: { signal: AbortSignal; headers?: Record<string, string> }) => Promise<HttpResponse>;

export interface RateQuote {
  provider: string;
  // How many KGS one unit is worth, per currency code (upper case).
  kgsPerUnit: Record<string, number>;
  // The day the source says the rates are for (YYYY-MM-DD), when it says.
  asOf: string | null;
}

export interface RateProvider {
  id: string;
  name: string;
  // Shown next to rates that came from this source when its terms ask for it.
  attribution: { text: string; url: string } | null;
  fetchQuote(fetcher: Fetcher, signal: AbortSignal): Promise<RateQuote>;
}

export class ProviderError extends Error {}

const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

async function getText(fetcher: Fetcher, url: string, signal: AbortSignal): Promise<string> {
  const response = await fetcher(url, { signal, headers: { Accept: "application/json, text/xml" } });
  if (!response.ok) throw new ProviderError(`HTTP ${response.status}`);
  return response.text();
}

// Rates given as "units of X per one unit of the base" turned into KGS per unit; needs KGS quoted.
export function fromBaseQuotes(perBase: Record<string, unknown>, base: string): Record<string, number> {
  const kgs = perBase.KGS;
  if (!positive(kgs)) throw new ProviderError("the source has no KGS rate");
  const out: Record<string, number> = { [base]: kgs };
  for (const [code, value] of Object.entries(perBase)) if (/^[A-Z]{3}$/.test(code) && positive(value)) out[code] = kgs / value;
  out.KGS = 1;
  return out;
}

// ---- ExchangeRate-API, open access (no key; daily; attribution required) -------------------------
export function parseErApi(text: string): RateQuote {
  const json = JSON.parse(text) as { result?: string; base_code?: string; rates?: Record<string, unknown>; time_last_update_unix?: number };
  if (json.result !== "success" || !json.rates || json.base_code !== "USD") throw new ProviderError("unexpected answer");
  const asOf = typeof json.time_last_update_unix === "number" ? new Date(json.time_last_update_unix * 1000).toISOString().slice(0, 10) : null;
  return { provider: "er-api", kgsPerUnit: fromBaseQuotes(json.rates, "USD"), asOf };
}

export const erApiProvider: RateProvider = {
  id: "er-api",
  name: "ExchangeRate-API",
  attribution: { text: "Rates By Exchange Rate API", url: "https://www.exchangerate-api.com" },
  fetchQuote: async (fetcher, signal) => parseErApi(await getText(fetcher, "https://open.er-api.com/v6/latest/USD", signal)),
};

// ---- fawazahmed0 currency-api (no key; daily; two mirrors) ---------------------------------------
export function parseCurrencyApi(text: string): RateQuote {
  const json = JSON.parse(text) as { date?: string; usd?: Record<string, unknown> };
  if (!json.usd || typeof json.usd !== "object") throw new ProviderError("unexpected answer");
  const upper: Record<string, unknown> = {};
  for (const [code, value] of Object.entries(json.usd)) upper[code.toUpperCase()] = value;
  return { provider: "currency-api", kgsPerUnit: fromBaseQuotes(upper, "USD"), asOf: typeof json.date === "string" ? json.date : null };
}

const CURRENCY_API_URLS = [
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
  "https://latest.currency-api.pages.dev/v1/currencies/usd.json",
];

export const currencyApiProvider: RateProvider = {
  id: "currency-api",
  name: "Currency API (fawazahmed0)",
  attribution: null,
  fetchQuote: async (fetcher, signal) => {
    let last: unknown = null;
    for (const url of CURRENCY_API_URLS) {
      try {
        return parseCurrencyApi(await getText(fetcher, url, signal));
      } catch (error) {
        if (signal.aborted) throw error;
        last = error;
      }
    }
    throw last instanceof Error ? last : new ProviderError("no mirror answered");
  },
};

// ---- National Bank of the Kyrgyz Republic: official rates, som per unit (a few currencies) ------
// <CurrencyRates Date="11.11.2026"><Currency ISOCode="USD"><Nominal>1</Nominal><Value>87,4500</Value></Currency>…
export function parseNbkr(text: string): RateQuote {
  const out: Record<string, number> = { KGS: 1 };
  const pattern = /<Currency\s+ISOCode="([A-Z]{3})"[^>]*>([\s\S]*?)<\/Currency>/g;
  for (const [, code, body] of text.matchAll(pattern)) {
    const value = Number(/<Value>\s*([\d.,]+)\s*<\/Value>/.exec(body ?? "")?.[1]?.replace(",", "."));
    const nominal = Number(/<Nominal>\s*(\d+)\s*<\/Nominal>/.exec(body ?? "")?.[1] ?? "1") || 1;
    if (code && positive(value)) out[code] = value / nominal;
  }
  if (Object.keys(out).length < 2) throw new ProviderError("unexpected answer");
  const date = /Date="(\d{2})\.(\d{2})\.(\d{4})"/.exec(text);
  return { provider: "nbkr", kgsPerUnit: out, asOf: date ? `${date[3]}-${date[2]}-${date[1]}` : null };
}

export const nbkrProvider: RateProvider = {
  id: "nbkr",
  name: "National Bank of the Kyrgyz Republic",
  attribution: null,
  fetchQuote: async (fetcher, signal) => parseNbkr(await getText(fetcher, "https://www.nbkr.kg/XML/daily.xml", signal)),
};

// The order in which sources are asked. Each currency is taken from the first source that has it,
// so a source with few currencies can stand first and the others fill in the rest.
export const RATE_PROVIDERS: readonly RateProvider[] = [erApiProvider, currencyApiProvider, nbkrProvider];
