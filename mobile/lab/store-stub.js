// The store of the application on the page: the ledger of the stand, ready, never changing.
import data from "./ledger.json";
const state = { status: "ready", data, posted: [] };
const listeners = new Set();
export const appStore = () => ({
  getState: () => state,
  subscribe: (l) => (listeners.add(l), () => listeners.delete(l)),
  run: () => undefined,
  createBackup: () => true,
});
export const phoneLanguage = () => "en";
