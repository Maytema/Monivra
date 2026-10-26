/* Test mode: self checks and automated tests replace browser-only side effects. */

// True when the page runs under automated tests (downloads, printing and animations are skipped).
export function isTestMode() {
  return Boolean(window.__MONIVRA_TEST__);
}
