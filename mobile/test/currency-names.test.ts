import assert from "node:assert/strict";
import { test } from "node:test";
import { currencyName, searchCurrencies } from "../src/ui/currency-names.ts";

test("names come from the built-in table, in the language asked", () => {
  assert.equal(currencyName("USD", "en-US"), "US Dollar");
  assert.equal(currencyName("USD", "ru-RU"), "Доллар США");
});

test("search finds a currency by code, name or country in any language", () => {
  assert.equal(searchCurrencies("kgs", "en-US")[0], "KGS");
  assert.ok(searchCurrencies("доллар", "en-US").includes("USD"));
  assert.ok(searchCurrencies("japan", "ru-RU").includes("JPY"));
  assert.ok(searchCurrencies("киргиз", "en-US").length > 0 || searchCurrencies("кыргыз", "en-US").includes("KGS"));
});
