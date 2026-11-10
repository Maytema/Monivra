/* The internal copy of the data in the Android shell. Every save of the application goes to its
   storage (localStorage of the WebView, which survives the application being stopped, the phone being
   restarted and the application being updated) and, a moment later, to a second copy in the private
   files of the application (written whole, checked by a hash, the previous one kept). The second copy
   is used for one thing: when the first one is gone while the application is installed (the WebView
   lost its storage), the data is brought back from it at the start. It never replaces data that is
   there, and it is not a backup: both are deleted with the application, and a data file saved outside
   the application is the only copy that survives an uninstall. */
import { SAVE_COUNT_KEY, STORAGE_KEY } from "../core/constants.js";
import { native } from "./native.js";

let timer = 0;
let dirty = false;
let chain = Promise.resolve();
const DELAY_MS = 800;

// Writes the stored text to the internal copy now (when there is something new to write).
export function flushMirror() {
  clearTimeout(timer);
  if (!native || !dirty) return chain;
  dirty = false;
  let text = null;
  let seq = 0;
  try {
    text = localStorage.getItem(STORAGE_KEY);
    seq = Number(localStorage.getItem(SAVE_COUNT_KEY)) || 0;
  } catch {
    // Nothing to copy.
  }
  if (text === null) return chain;
  chain = chain
    .then(() => native.mirrorWrite({ text, seq }))
    .catch(() => {
      dirty = true; // tried again at the next save or when the application leaves the screen
    });
  return chain;
}

// Called after every save: the copy follows shortly, once for a burst of saves.
export function mirrorSoon() {
  if (!native) return;
  dirty = true;
  clearTimeout(timer);
  timer = setTimeout(flushMirror, DELAY_MS);
}

// Is this text something the application wrote: JSON of a dataset of this schema. Only a first check;
// the full validation is made when the data is loaded, and data that fails it is shown to the person
// (recovery screen), never dropped.
const looksLikeData = (text) => {
  try {
    const x = JSON.parse(text);
    return x?.schema === 1 && Array.isArray(x.accounts) && Array.isArray(x.ops);
  } catch {
    return false;
  }
};

// At the start, before the data is read, the stored data and the internal copy are compared:
//   no stored data, a usable copy      → the copy is restored ("restored");
//   stored data, and the copy is a later save of it (its save number is higher: the application was
//   stopped before the WebView wrote the last saves to disk) → the copy is taken ("newer");
//   anything else → the stored data is left alone ("kept"), whether it is damaged (the recovery screen
//   deals with it) or the copy is the same or older.
// "none" means nothing anywhere (a new install); "unreadable" that the copy exists but cannot be used,
// and it is left as it is.
export async function restoreFromMirror() {
  if (!native) return "none";
  let stored = null;
  let storedSaves = 0;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
    storedSaves = Number(localStorage.getItem(SAVE_COUNT_KEY)) || 0;
  } catch {
    return "kept";
  }
  if (stored !== null && !looksLikeData(stored)) return "kept";
  const copy = await native.mirrorRead();
  if (copy.status === "missing") return stored === null ? "none" : "kept";
  if (copy.status !== "ok" || !looksLikeData(copy.text)) return stored === null ? "unreadable" : "kept";
  if (stored === null) {
    localStorage.setItem(STORAGE_KEY, copy.text);
    localStorage.setItem(SAVE_COUNT_KEY, String(copy.seq ?? 0));
    return "restored";
  }
  if ((copy.seq ?? 0) > storedSaves) {
    localStorage.setItem(STORAGE_KEY, copy.text);
    localStorage.setItem(SAVE_COUNT_KEY, String(copy.seq));
    return "newer";
  }
  return "kept";
}
