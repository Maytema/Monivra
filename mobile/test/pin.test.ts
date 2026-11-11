// The PIN hash: published test vectors, matching, and the waiting after wrong attempts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lockoutSeconds, makePin, pbkdf2, pinMatches, sha256, isValidPin } from "../src/domain/pin.ts";

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

test("SHA-256 and PBKDF2 give the published test vectors", () => {
  assert.equal(hex(sha256(bytes("abc"))), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(hex(pbkdf2(bytes("password"), bytes("salt"), 2)), "ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43");
});

test("a PIN matches only itself; the record holds no digits", () => {
  const record = makePin("4827", new Uint8Array(16).fill(7));
  assert.equal(pinMatches(record, "4827"), true);
  assert.equal(pinMatches(record, "4828"), false);
  assert.equal(JSON.stringify(record).includes("4827"), false);
  assert.equal(isValidPin("12345"), false);
  assert.equal(isValidPin("123456"), true);
  assert.deepEqual([4, 5, 6, 9, 12].map(lockoutSeconds), [0, 30, 60, 480, 480]);
});
