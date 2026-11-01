/* Navigation: the stack of pages and the stack of sheets and dialogs above the current screen */
import { render } from "../app/shell.js";
import { newId } from "../core/constants.js";
import { locked, uiState } from "../core/state.js";
import { save } from "../data/storage.js";
import { toast } from "./primitives.js";

// Push a full-screen page onto the page stack.
export function openPage(kind, params = {}) {
  uiState.pages.push({ kind, ...params });
  uiState.layers = [];
  render(true);
}
// Open a bottom sheet or dialog layer.
export function openSheet(fn, title = "", kind = "sheet", anchor = null) {
  uiState.layers.push({ fn, title, kind, anchor, id: newId() });
  render();
}
// Close the top n sheet/dialog layers.
export function closeLayers(n = 1) {
  uiState.layers.splice(Math.max(0, uiState.layers.length - n), n);
  render();
}
// Go back one step: close the top layer, otherwise pop the top page.
export function goBack() {
  if (locked) return;
  if (uiState.layers.length) uiState.layers.pop();
  else if (uiState.pages.length) uiState.pages.pop().restore?.();
  else if (uiState.selection) {
    uiState.selection = false;
    uiState.selected = [];
  } else if (uiState.search) {
    uiState.search = false;
  } else if (uiState.tab !== "accounts") uiState.tab = "accounts";
  render();
}
// Reset all pages and layers and show a root tab.
export function goHome(tab) {
  uiState.tab = tab;
  while (uiState.pages.length) uiState.pages.pop().restore?.();
  uiState.layers = [];
  uiState.selection = false;
  uiState.selected = [];
  uiState.search = false;
  render(true);
}
// Close all layers, pop the current page, save, re-render and show a confirmation toast.
export function finishFlow(message = "Saved") {
  uiState.layers = [];
  if (uiState.pages.length) uiState.pages.pop();
  save();
  render();
  toast(message);
}
