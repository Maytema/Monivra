// The pictures of a report preview: the first pages behind the dialog, the rest in the background, a stop.
import assert from "node:assert/strict";
import { test } from "node:test";
import { PageImages } from "../src/application/report/page-images.ts";

const renderer = () => {
  const calls: [number, number][] = [];
  const render = async (from: number, count: number) => {
    calls.push([from, count]);
    return Array.from({ length: count }, (_, i) => `file:///page-${from + i}.jpg`);
  };
  return { calls, render };
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("the first pages are made in small batches, saying how many are ready", async () => {
  const { calls, render } = renderer();
  const images = new PageImages(10, render);
  const said: number[] = [];
  await images.first(3, (ready) => said.push(ready));
  assert.deepEqual(calls, [
    [0, 2],
    [2, 1],
  ]);
  assert.deepEqual(said, [2, 3]);
  assert.equal(images.ready, 3);
  assert.equal(images.done, false);
});

test("the rest is made in the background and every batch is told", async () => {
  const { render } = renderer();
  const images = new PageImages(5, render);
  let told = 0;
  images.subscribe(() => (told += 1));
  await images.first(1, () => {});
  images.continueInBackground();
  for (let i = 0; i < 10 && !images.done; i++) await settle();
  assert.equal(images.done, true);
  assert.deepEqual(images.uris, [0, 1, 2, 3, 4].map((i) => `file:///page-${i}.jpg`));
  assert.equal(told, 3); // 1, then 2 + 2
});

test("a stopped preview makes no more pages; a document shorter than the first pages is complete", async () => {
  const { calls, render } = renderer();
  const images = new PageImages(6, render);
  images.stop();
  images.continueInBackground();
  await settle();
  assert.equal(calls.length, 0);
  assert.equal(images.stopped, true);
  const short = new PageImages(2, renderer().render);
  await short.first(3, () => {});
  assert.equal(short.done, true);
});

test("a stop asked behind the dialog ends the first pages", async () => {
  const stop = new AbortController();
  stop.abort();
  await assert.rejects(new PageImages(4, renderer().render).first(3, () => {}, stop.signal));
});
