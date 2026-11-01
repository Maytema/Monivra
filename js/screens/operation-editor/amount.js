/* The amount of the editor: typing, the calculator and the two sides of a cross-currency operation */
import { render } from "../../app/shell.js";
import { escapeHtml } from "../../core/constants.js";
import {
  convertCurrency,
  currencyRatio,
  evaluateExpression,
  offRate,
  quoteRate,
} from "../../domain/finance.js";
import { leadingSide } from "../../domain/dual-amount.js";
import { typeKey } from "../../domain/keypad.js";
import { translateWith } from "../../i18n/index.js";
import { registerAction, registerInput } from "../../ui/handlers.js";
import { buttonHtml, toast } from "../../ui/primitives.js";
import { pairRateText, rateText } from "../../ui/rate-line.js";
import { commitOperation } from "./editor.js";

const ARITHMETIC = ["÷", "×", "−", "+", "="];
const asDecimal = (cents) => String(cents / 100);

// What is typed, what the other side of a cross-currency operation receives, and how keys change it.
export function amountModel(editor, parties) {
  const { draft } = editor;
  const { primary, secondary, dual } = parties;
  const typing = () => (editor.calculatorOn ? editor.calculatorExpression : draft.expr);
  const sourceToReceive = (cents) => convertCurrency(cents, primary.currency, secondary.currency);
  const receiveToSource = (cents) => convertCurrency(cents, secondary.currency, primary.currency);

  // Amount on the sender side; zero while the expression is incomplete.
  const sentAmount = () => {
    try {
      return evaluateExpression(typing());
    } catch {
      return 0;
    }
  };

  const receiveExpression = () => {
    // An operation that is opened keeps the amount it received until the sent amount is edited.
    if (draft.receiveManual && Number.isSafeInteger(draft.receive)) return asDecimal(draft.receive);
    try {
      return asDecimal(sourceToReceive(evaluateExpression(typing())));
    } catch {
      return "0";
    }
  };

  // The expression of the side the keypad edits.
  const expression = () =>
    dual && editor.activeSide === "receive"
      ? (editor.typedReceive ?? receiveExpression())
      : typing();

  // Both amounts as they are now, in minor units.
  const amounts = () => {
    let receive = 0;
    try {
      receive = evaluateExpression(receiveExpression());
    } catch {
      // an incomplete expression counts as zero
    }
    return { send: sentAmount(), receive };
  };

  const setSentExpression = (value) => {
    if (editor.calculatorOn) {
      editor.calculatorExpression = value;
      editor.resultReady = false;
    } else draft.expr = value;
  };

  const typeReceive = (value) => {
    const before = amounts();
    editor.typedReceive = value;
    editor.resultReady = false;
    try {
      const cents = evaluateExpression(value);
      editor.leader = leadingSide(editor.leader, "receive", before);
      // The leading side sets the other one; otherwise both amounts stay as they were typed.
      if (editor.leader === "receive") setSentExpression(asDecimal(receiveToSource(cents)));
      draft.receive = cents;
      draft.receiveManual = true;
    } catch {
      // keep the previous value while the expression is incomplete
    }
  };

  const typeSent = (value) => {
    if (!editor.calculatorOn && /[+×÷−*/]/.test(value)) {
      toast("Enable calculator for arithmetic");
      return;
    }
    const before = amounts();
    setSentExpression(value);
    editor.typedReceive = undefined;
    if (!dual) {
      draft.receiveManual = false;
      return;
    }
    // The leading side sets the other one; otherwise the received amount stays as it was typed.
    editor.leader = leadingSide(editor.leader, "send", before);
    draft.receive = before.receive;
    draft.receiveManual = editor.leader !== "send";
  };

  const type = (value) =>
    dual && editor.activeSide === "receive" ? typeReceive(value) : typeSent(value);

  return {
    sentAmount,
    receiveExpression,
    expression,
    sourceToReceive,

    // Take the whole available balance as the sent amount.
    fill(cents) {
      draft.expr = asDecimal(cents);
      editor.typedReceive = undefined;
      editor.leader = "send";
      draft.receiveManual = false;
    },

    // A key of the keypad.
    press(key) {
      if (!editor.calculatorOn && ARITHMETIC.includes(key)) {
        toast("Double-tap the calculator key to enable calculations");
        return;
      }
      if (key === "⌫" || key === "C") type(typeKey(expression(), key));
      else if (key === "=") {
        try {
          type(typeKey(expression(), key));
          editor.resultReady = true;
        } catch (error) {
          toast(error.message);
          return;
        }
      } else {
        // After a computed result, a digit starts a new calculation; an operator continues it.
        const startNew = editor.calculatorOn && editor.resultReady && /[0-9.]/.test(key);
        type(typeKey(expression(), key, startNew));
      }
      render();
    },

    toggleCalculator() {
      editor.calculatorOn = !editor.calculatorOn;
      toast(editor.calculatorOn ? "Calculator is on" : "Calculator is off");
      // The calculator works on a copy: the operation changes only when it is saved.
      if (editor.calculatorOn) {
        editor.calculatorExpression = String(draft.expr || "0");
        editor.resultReady = false;
      }
      editor.typedReceive = undefined;
      render();
    },

    // The check after "=" saves the calculated result at once.
    saveCalculated() {
      if (!editor.resultReady) return toast("Press = first");
      draft.expr = editor.calculatorExpression;
      commitOperation(editor);
    },

    // The rate of this operation, with the current one when the amounts do not follow it.
    rateNoteHtml() {
      const now = amounts();
      if (!now.send || !now.receive) return "";
      const pair = [
        [now.send, primary.currency],
        [now.receive, secondary.currency],
      ];
      const today = rateText(
        quoteRate(
          primary.currency,
          secondary.currency,
          currencyRatio(primary.currency, secondary.currency),
        ),
        "Rate today: 1 {from} = {rate} {to}",
      );
      return `<p class="dual-rate">${pairRateText(pair, "Operation rate: 1 {from} = {rate} {to}")}${offRate(pair) ? `<br>${today}` : ""}</p>`;
    },

    type,
  };
}

// One of the two amounts of a cross-currency operation; tapping it makes the keypad type there.
function sideHtml(editor, side, party, shownExpression) {
  const active = editor.activeSide === side;
  const select = () => {
    editor.activeSide = side;
    editor.typedReceive = side === "receive" ? shownExpression() : undefined;
    editor.compact = false;
    render();
  };
  const label = translateWith("Edit amount in {currency}", {
    currency: escapeHtml(party.currency),
  });
  return `<div class="calc-number dual-number ${side === "receive" ? "dual-receive" : ""} ${active ? "dual-active" : ""}" data-side="${side}" style="--tint:${escapeHtml(party.color || "")}">${buttonHtml(
    `${escapeHtml(shownExpression())} ${escapeHtml(party.currency)}`,
    select,
    "dual-value",
    `aria-label="${label}" aria-pressed="${active}"`,
  )}</div>`;
}

// The amount block of the editor: two sides for a cross-currency operation, otherwise one field.
export function amountHtml(editor, parties, model) {
  const { draft } = editor;
  const { primary, secondary, dual, currency } = parties;
  if (dual) {
    const sent = () =>
      editor.activeSide === "send"
        ? model.expression()
        : editor.calculatorOn
          ? editor.calculatorExpression
          : draft.expr;
    const received = () =>
      editor.activeSide === "receive" ? model.expression() : model.receiveExpression();
    return `${sideHtml(editor, "send", primary, sent)}${sideHtml(editor, "receive", secondary, received)}${model.rateNoteHtml()}`;
  }
  const shown = model.expression();
  // An opened operation leaves its compact view when its value is tapped.
  const expand = editor.compact
    ? `role="button" tabindex="0" data-action="${registerAction(() => {
        editor.compact = false;
        render();
      })}"`
    : "";
  return `<div class="calc-number single-tappable" ${expand}><input style="width:${Math.max(1, String(shown).length)}ch" aria-label="${editor.calculatorOn ? "Calculator expression" : "Amount"}" inputmode="none" readonly value="${escapeHtml(shown)}" data-input="${registerInput(model.type)}"><span>${escapeHtml(currency)}</span></div>`;
}
