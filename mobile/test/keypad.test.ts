// The keypad rules and the two sides of an operation behave as in the first application.
import assert from "node:assert/strict";
import test from "node:test";
import { leadingSide } from "../src/domain/dual-amount.ts";
import { keypadDigits } from "../src/domain/keypad.ts";
import { typeKey } from "../src/domain/money.ts";
import { putAccountOnSide, putCategoryOnSide } from "../src/domain/sides.ts";
import { fixture } from "./support/helpers.ts";

test("typing: digits, one decimal point, delete, clear, result", () => {
  assert.equal(typeKey("0", "5"), "5");
  assert.equal(typeKey("12", "3"), "123");
  assert.equal(typeKey("1.5", "."), "1.5");
  assert.equal(typeKey("1+", "."), "1+0.");
  assert.equal(typeKey("12", "⌫"), "1");
  assert.equal(typeKey("5", "⌫"), "0");
  assert.equal(typeKey("123", "C"), "0");
  assert.equal(typeKey("2+3", "="), "5");
  assert.equal(typeKey("5", "7", true), "7");
  assert.throws(() => typeKey("2+", "="));
});

test("the digits follow the setting for the order of keys", () => {
  assert.deepEqual(keypadDigits(false).slice(0, 3), ["7", "8", "9"]);
  assert.deepEqual(keypadDigits(true).slice(0, 3), ["1", "2", "3"]);
});

test("the side typed last leads, until it is empty", () => {
  assert.equal(leadingSide("send", "receive", { send: 100, receive: 0 }), "send");
  assert.equal(leadingSide("send", "receive", { send: 0, receive: 5 }), "receive");
  assert.equal(leadingSide("send", "send", { send: 100, receive: 0 }), "send");
});

test("a category on one side makes the other side an account; an account where a category stood makes a transfer", () => {
  const data = fixture("sample");
  const first = data.accounts[0];
  assert.ok(first);
  const expense = putCategoryOnSide(data, { type: "income" as const, category: undefined, from: null, to: first.id }, false, "cat");
  assert.equal(expense.type, "expense");
  assert.equal(expense.from, first.id);
  assert.equal(expense.to, null);
  const transfer = putAccountOnSide(data, { type: "expense" as const, category: "cat", from: first.id, to: null }, false, "other");
  assert.equal(transfer.type, "transfer");
  assert.equal(transfer.category, undefined);
  assert.equal(transfer.to, "other");
  assert.equal(transfer.from, first.id);
});
