/* The menu that starts a new operation, transfer or scheduled payment */
import { render } from "../../app/shell.js";
import { escapeHtml } from "../../core/constants.js";
import { appData } from "../../core/state.js";
import {
  accountBalance,
  categoryById,
  defaultAccountId,
  formatMoney,
} from "../../domain/finance.js";
import { operationStart } from "../operation-editor/start.js";
import { closeLayers, openSheet } from "../../ui/navigation.js";
import { badgeHtml, buttonHtml } from "../../ui/primitives.js";

// Chooser opened by the + button on the operations tab.
export function operationsAddMenu(extra = {}, scheduled = false) {
  // Three primary tabs exactly as the source application. Selection is the
  // only transition into an editor; switching or dismissing never creates one.
  const state = { direction: "expense" };
  const directions = ["income", "expense", "accounts"];
  const choose = (item) => {
    const dir = state.direction;
    closeLayers();
    if (dir === "expense")
      operationStart(
        { type: "expense", category: item.id, from: defaultAccountId(), ...extra },
        scheduled,
      );
    else if (dir === "income")
      operationStart(
        { type: "income", category: item.id, to: defaultAccountId(), ...extra },
        scheduled,
      );
    else
      operationStart(
        { type: "transfer", from: item.id, to: defaultAccountId(item.id), ...extra },
        scheduled,
      );
  };
  const view = () => {
    const dir = state.direction;
    const items =
      dir === "accounts"
        ? appData.accounts.filter((a) => !a.archived)
        : appData.categories.filter((c) => !c.archived && !c.parent && c.type === dir);
    return `<div class="add-shell" data-add-chooser="1"><h2 class="add-heading">Add an operation</h2><div class="add-tabs">${directions
      .map((id) =>
        buttonHtml(
          id === "income" ? "Incomes" : id === "expense" ? "Expenses" : "Accounts",
          () => {
            state.direction = id;
            render();
          },
          "add-tab " + (dir === id ? "active" : ""),
        ),
      )
      .join(
        "",
      )}</div><div class="add-grid">${items.map((item) => buttonHtml(`${badgeHtml(item)}<span class="add-item-text"><strong>${escapeHtml(item.name)}</strong><small>${formatMoney(dir === "accounts" ? accountBalance(item.id) : appData.ops.filter((o) => o.category === item.id || categoryById(o.category)?.parent === item.id).reduce((n, o) => n + o.amount, 0), item.currency || appData.settings.currency)}</small></span>`, () => choose(item), "add-item")).join("")}</div></div>`;
  };
  openSheet(view, "Add an operation");
  // Event delegation survives redraws of the sheet's inner content.
  const attach = () => {
    const panel = document.querySelector("[data-add-chooser]");
    if (!panel || panel.dataset.swipeReady) return;
    panel.dataset.swipeReady = "1";
    let x = 0,
      y = 0;
    panel.addEventListener(
      "touchstart",
      (e) => {
        x = e.touches[0].clientX;
        y = e.touches[0].clientY;
      },
      { passive: true },
    );
    panel.addEventListener(
      "touchend",
      (e) => {
        const dx = e.changedTouches[0].clientX - x,
          dy = e.changedTouches[0].clientY - y;
        if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
        const next = directions.indexOf(state.direction) + (dx < 0 ? 1 : -1);
        if (next >= 0 && next < 3) {
          state.direction = directions[next];
          render();
          attach();
        }
      },
      { passive: true },
    );
  };
  requestAnimationFrame(attach);
}
