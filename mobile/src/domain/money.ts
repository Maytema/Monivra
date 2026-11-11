// Money: conversion, rounding, the calculator, fees and the shown percent. Every rule here is the
// rule of the first application (js/domain/finance.js, fees.js, percent.js), checked by the parity
// tests; nothing here reads global state.
import { DomainError } from "./errors.ts";
import type { Fee, Minor, Rates } from "./types.ts";

export const MAX_AMOUNT: Minor = 9e12;

// How many KGS one unit is worth; an unknown currency counts as 1, as before.
const rateOf = (rates: Rates, code: string | undefined): number =>
  (code !== undefined && rates[code]) || 1;

// Converts minor units between currencies, rounding once (Math.round: halves go up).
export const convert = (n: Minor, from: string | undefined, to: string | undefined, rates: Rates): Minor =>
  Math.round((n * rateOf(rates, from)) / rateOf(rates, to));

// How many units of `want` one unit of `have` is worth.
export const ratio = (have: string, want: string, rates: Rates): number =>
  rateOf(rates, have) / rateOf(rates, want);

// Evaluates a calculator expression (+ − × ÷, precedence) and returns minor units.
export function evaluateExpression(expr: string): Minor {
  const clean = String(expr)
    .replace(/[×]/g, "*")
    .replace(/[÷]/g, "/")
    .replace(/[−]/g, "-")
    .replace(/,/g, ".")
    .replace(/\s/g, "");
  if (!/^-?\d*\.?\d+(?:[+\-*/]-?\d*\.?\d+)*$/.test(clean)) throw new DomainError("Enter a valid amount");
  const tokens = clean.match(/(?:^|(?<=[+*/-]))-?\d*\.?\d+|[+*/-]/g);
  if (!tokens || tokens.join("") !== clean) throw new DomainError("Invalid expression");
  const terms = [Number(tokens[0])];
  for (let i = 1; i < tokens.length; i += 2) {
    const operator = tokens[i];
    const operand = Number(tokens[i + 1]);
    const last = terms.length - 1;
    if (operator === "*") terms[last] = (terms[last] ?? 0) * operand;
    else if (operator === "/") {
      if (operand === 0) throw new DomainError("Cannot divide by zero");
      terms[last] = (terms[last] ?? 0) / operand;
    } else terms.push(operator === "-" ? -operand : operand);
  }
  const cents = Math.round(terms.reduce((sum, term) => sum + term, 0) * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > MAX_AMOUNT) throw new DomainError("Amount is too large");
  return cents;
}

// An expression after one key press (the calculator keypad).
export function typeKey(expr: string, key: string, fresh = false): string {
  if (key === "⌫") return String(expr).slice(0, -1) || "0";
  if (key === "C") return "0";
  if (key === "=") return String(evaluateExpression(expr) / 100);
  const base = fresh ? "0" : String(expr);
  if (key === ".") {
    const number = base.split(/[+−×÷*/-]/).at(-1) ?? "";
    if (number.includes(".")) return base;
    return base + (number === "" ? "0." : ".");
  }
  return (base === "0" && /[0-9]/.test(key) ? "" : base) + key;
}


// ---- Fees ----------------------------------------------------------------------------------

const feeSize = (fee: Fee, base: number): number =>
  (fee.percent ?? 0) > 0 ? (base * (fee.percent ?? 0)) / 100 : (fee.value ?? 0) * 100;

// Removes floating point noise before rounding to whole minor units.
const roundMinor = (n: number): number => Math.sign(n) * Math.round(Math.round(Math.abs(n) * 1e6) / 1e6);

export interface FeeStep {
  fee: Fee;
  delta: Minor;
}

// Fees applied in order: a deduction works on what the previous ones left, an addition on the
// original amount; the result never drops below zero.
export function applyFees(amount: Minor, fees: readonly Fee[] = []): { steps: FeeStep[]; net: Minor } {
  let running = amount;
  const steps = fees.map((fee) => {
    const size = feeSize(fee, fee.add ? amount : running);
    running += fee.add ? size : -size;
    return { fee, delta: roundMinor(fee.add ? size : -size) };
  });
  return { steps, net: Math.max(0, roundMinor(running)) };
}

export const netAmount = (op: { amount: Minor; fees?: readonly Fee[] | undefined }): Minor =>
  applyFees(op.amount, op.fees ?? []).net;

export const feeOfKind = (fees: readonly Fee[] | undefined, kind: Fee["kind"]): Fee | null =>
  fees?.find((fee) => fee.kind === kind) ?? null;

// Replaces the fee of one kind (null removes it), keeping the order of the others.
export function withFee(fees: readonly Fee[] | undefined, kind: Fee["kind"], fee: Omit<Fee, "kind"> | null): Fee[] {
  const list = fees ?? [];
  const rest = list.filter((f) => f.kind !== kind);
  const index = list.findIndex((f) => f.kind === kind);
  if (fee) rest.splice(index < 0 ? rest.length : index, 0, { ...fee, kind });
  return rest;
}

// ---- Percent ---------------------------------------------------------------------------------

// Two decimals; a target that is not reached never shows 100; what is not a number shows 0.
export function shownPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  const rounded = Math.round(Number((percent * 100).toPrecision(12))) / 100 || 0;
  return percent < 100 && rounded >= 100 ? 99.99 : rounded;
}

// ---- Formatting --------------------------------------------------------------------------------

const SEPARATORS: Record<string, [string, string]> = {
  "comma-dot": [",", "."],
  "dot-comma": [".", ","],
  "space-dot": [" ", "."],
  "space-comma": [" ", ","],
};
export const NUMBER_FORMATS = Object.keys(SEPARATORS);

// A number of minor units with the chosen separators and a true minus sign.
export function formatNumber(n: Minor, format: string, group: boolean, least: number, most = least): string {
  const [groupSign, decimalSign] = SEPARATORS[format] ?? [",", "."];
  return (n / 100)
    .toLocaleString("en-US", { minimumFractionDigits: least, maximumFractionDigits: most, useGrouping: group })
    .replace("-", "−")
    .replace(/[,.]/g, (c) => (c === "," ? groupSign : decimalSign));
}

export interface MoneyFormat {
  numberFormat: string;
  groupDigits: boolean;
  decimal: boolean;
  hideCents: boolean;
  currencyFirst: boolean;
}

// An amount as text with the formatting settings (never masked).
export function formatAmount(n: Minor, currency: string, s: MoneyFormat): string {
  const fixed = s.decimal && !s.hideCents && n % 100 !== 0 ? 2 : 0;
  const text = formatNumber(n, s.numberFormat, s.groupDigits, fixed, s.hideCents ? 0 : 2);
  return s.currencyFirst ? currency + " " + text : text + " " + currency;
}
