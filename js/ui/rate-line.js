/* Rates written for people: "1 $ = 20 KGS" */
import { quoteRate } from "../domain/finance.js";
import { translateWith } from "../i18n/index.js";

// Text for a rate quoted as [base, quote, quote per base].
export const rateText = ([base, quote, rate], template = "1 {from} = {rate} {to}") =>
  translateWith(template, { from: base, rate: Number(rate.toPrecision(6)), to: quote });
// The rate between the two amounts of an operation, as [[amount, currency], [amount, currency]].
export const pairRateText = ([[a, from], [b, to]], template) =>
  rateText(quoteRate(from, to, b / a), template);
