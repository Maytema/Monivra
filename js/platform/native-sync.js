/* The internal copy of the data in the Android shell. Every save of the application goes to its
   storage (localStorage of the WebView, which survives the application being stopped, the phone being
   restarted and the application being updated) and, a moment later, to a second copy in the private
   files of the application (written whole, checked by a hash, the previous one kept). The second copy
   is used for one thing: when the first one is gone while the application is installed (the WebView
   lost its storage), the data is brought back from it at the start. It never replaces data that is
   there, and it is not a backup: both are deleted with the application, and a data file saved outside
   the application is the only copy that survives an uninstall. */
import { STORAGE_KEY } from "../core/constants.js";
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
  try {
    text = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Nothing to copy.
  }
  if (text === null) return chain;
  chain = chain
    .then(() => native.mirrorWrite({ text }))
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

// At the start, before the data is read: when the application has no stored data but the internal
// copy has, the stored data is restored from the copy. Resolves "restored", "kept" (stored data is
// there, nothing is touched), "none" (nothing anywhere: a new install) or "unreadable" (the copy
// exists but cannot be used; it is left as it is).
export async function restoreFromMirror() {
  if (!native) return "none";
  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    return "kept";
  }
  if (stored !== null) return "kept";
  const copy = await native.mirrorRead();
  if (copy.status === "missing") return "none";
  if (copy.status !== "ok" || !looksLikeData(copy.text)) return "unreadable";
  localStorage.setItem(STORAGE_KEY, copy.text);
  return "restored";
}
