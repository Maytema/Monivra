import { render } from "../../app/shell.js";
import { escapeHtml, iconSvg } from "../../core/constants.js";
import { accountById, currencyRatio, formatMoney, quoteRate } from "../../domain/finance.js";
import { planCurrencyChange } from "../../domain/currency-change.js";
import { translate, translateCount, translateWith } from "../../i18n/index.js";
import { rateText } from "../../ui/rate-line.js";
import { buttonHtml } from "../../ui/primitives.js";
import { closeLayers, openSheet } from "../../ui/navigation.js";

// Ask how an account changes its currency: recalculate what was spent (default) or convert all.
// The sheet shows what each choice does to this account and to the accounts it sent money to.
export function currencyChangeDialog(a, currency, done) {
  let explain = false;
  const money = (n, code) => formatMoney(n, code);
  const quoted = quoteRate(a.currency, currency, currencyRatio(a.currency, currency));
  const pick = (mode) => () => {
    closeLayers();
    done(mode);
  };
  const lines = (plan) => {
    const rows = [
      translateWith("Balance: {before} → {after}", {
        before: money(plan.before, a.currency),
        after: money(plan.after, currency),
      }),
    ];
    if (plan.spentBefore !== plan.spentAfter)
      rows.push(
        translateWith("{operations}: {before} → {after}", {
          operations: translateCount("{n} operation taken", "{n} operations taken", plan.taken),
          before: money(plan.spentBefore, a.currency),
          after: money(plan.spentAfter, currency),
        }),
      );
    for (const [id, delta] of plan.others) {
      const other = accountById(id);
      rows.push(
        translateWith("{name}: received {amount}", {
          name: other.name,
          amount: (delta > 0 ? "+" : "") + money(delta, other.currency),
        }),
      );
    }
    return `<ul class="currency-change-list">${rows.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>`;
  };
  const explanation = [
    "Operations that took money from this account (expenses and transfers out) are recalculated at the rate above. The old amount stays under the operation as “was”.",
    "A transfer out also changes what the other account received, so that account’s balance changes too.",
    "Income, transfers in, balance corrections and the opening balance keep their numbers and only get the new currency. That is why the balance can differ from the old one.",
    "Category totals and statistics follow the new amounts.",
    "Changing the currency back recalculates the same operations again; the numbers return with small rounding differences.",
    "“Convert everything” converts every amount, so the balance is the old balance at the current rate.",
  ];
  openSheet(
    () => {
      const spent = planCurrencyChange(a.id, currency, "spent"),
        all = planCurrencyChange(a.id, currency, "all");
      return `<h2>${translate("Change account currency")}</h2><p class="currency-change-rate">${rateText(quoted, "Rate today: 1 {from} = {rate} {to}")}</p>${lines(spent)}${buttonHtml("Change currency", pick("spent"), "primary")}${buttonHtml("Convert everything at the current rate", pick("all"), "outline")}<p class="hint currency-change-hint">${translateWith(
        "Convert everything: balance {after}",
        { after: money(all.after, currency) },
      )}</p>${buttonHtml(
        `${iconSvg("info", 20)}<span>${translate("Important: how this works")}</span>`,
        () => {
          explain = !explain;
          render();
        },
        "currency-change-info",
        `aria-expanded="${explain}"`,
      )}${explain ? `<div class="currency-change-explain">${explanation.map((t) => `<p>${translate(t)}</p>`).join("")}</div>` : ""}${buttonHtml("Cancel", () => closeLayers(), "outline")}`;
    },
    "Change account currency",
    "dialog",
  );
}
