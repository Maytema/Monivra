// Photos of operations: the problem codes of the native module become the problems the screen explains.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_PHOTO_BYTES, MAX_PHOTO_MB, PhotoError, toPhotoError } from "../src/platform/photo-rules.ts";

test("the codes of the native module are found inside the wrapped message", () => {
  assert.equal(toPhotoError(new Error("Call to function 'MonivraNative.photoDataUrl' has been rejected.\n→ Caused by: java.lang.Exception: PHOTO_FORMAT")).problem, "format");
  assert.equal(toPhotoError(new Error("… PHOTO_SIZE")).problem, "size");
  assert.equal(toPhotoError(new Error("PHOTO_DAMAGED")).problem, "damaged");
});

test("anything else is an unreadable photo, and a PhotoError passes through", () => {
  assert.equal(toPhotoError(new Error("disk")).problem, "unreadable");
  assert.equal(toPhotoError("text").problem, "unreadable");
  const own = new PhotoError("cloud");
  assert.equal(toPhotoError(own), own);
});

test("the size limit is in whole megabytes", () => {
  assert.equal(MAX_PHOTO_BYTES, MAX_PHOTO_MB * 1024 * 1024);
});
