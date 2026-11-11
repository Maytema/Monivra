// The state of one open operation editor and everything that changes it: typing and the calculator,
// the two amounts of a cross-currency operation, the parties, the rules for saving. No screen code:
// the views read it and call its methods (js/screens/operation-editor/{editor,amount,parties,start}.js).
import { systemClock } from "../../domain/dates.ts";
import { leadingSide, type Side } from "../../domain/dual-amount.ts";
import { DomainError } from "../../domain/errors.ts";
import { accountBalance, accountById, categoryById, defaultAccountId, offRate } from "../../domain/ledger.ts";
import { convert, evaluateExpression, ratio, typeKey } from "../../domain/money.ts";
import { isPlanned } from "../../domain/operations.ts";
import { putAccountOnSide, putCategoryOnSide } from "../../domain/sides.ts";
import type { Account, LedgerData, Operation, Recurrence, Reminder } from "../../domain/types.ts";

export interface EditorDraft extends Operation {
  // What is typed (a number, or an expression while the calculator is on).
  expr: string;
  // The amount is typed in another currency; it is converted to the account's one on saving.
  entryCurrency?: string;
  // The amount that was typed in another currency, as it was entered.
  foreign?: { currency: string; amount: number };
  recur?: Recurrence | null;
  reminder?: Reminder | null;
  anchorDay?: number;
}

// One side of the operation as the editor shows it: a tile, a currency.
export interface Party {
  id?: string;
  name: string;
  icon: string;
  color: string;
  currency: string;
}

// A balance correction has no real counterpart: "Adjustment" stands on the side the money comes from
// (a raise) or goes to (a cut) and can be replaced like any category or account.
const ADJUSTMENT = { name: "Adjustment", icon: "edit", color: "#94949c" } as const;

export interface Parties {
  isTransfer: boolean;
  isAdjustment: boolean;
  raise: boolean;
  root: Party | undefined;
  subcategories: Party[];
  source: Party | undefined;
  target: Party | undefined;
  primary: { currency: string; color?: string } | undefined;
  secondary: { currency: string; color?: string } | undefined;
  dual: boolean;
  accountCurrency: string;
  canPickCurrency: boolean;
  currency: string;
}

export interface EditorDeps {
  data(): LedgerData;
  // A short message ("Calculator is on").
  say(text: string): void;
}

const ARITHMETIC = ["÷", "×", "−", "+", "="];
const OPERATORS = /[+×÷−*/]/;
const asDecimal = (cents: number): string => String(cents / 100);

export class EditorSession {
  draft: EditorDraft;
  readonly scheduled: boolean;
  readonly editing: boolean;
  // An opened operation first shows its details and actions instead of the keypad.
  compact: boolean;
  // The draft as it was opened: any difference means there is something to save.
  private readonly snapshot: string;
  // Calculator mode types into a scratch expression that is applied only when saved.
  calculatorOn = false;
  calculatorExpression: string;
  resultReady = false;
  // Which of the two amounts of a cross-currency operation the keypad edits.
  activeSide: Side = "send";
  typedReceive: string | undefined;
  // The side typed last sets the other one.
  leader: Side = "send";
  confirmedDate: string | undefined;

  private version = 0;
  private readonly listeners = new Set<() => void>();
  private readonly deps: EditorDeps;

  constructor(draft: EditorDraft, scheduled: boolean, deps: EditorDeps) {
    this.deps = deps;
    this.draft = draft;
    this.scheduled = scheduled;
    this.editing = Boolean(draft.id);
    this.compact = this.editing;
    this.snapshot = JSON.stringify(draft);
    this.calculatorExpression = String(draft.expr || "0");
  }

  // ---- Observation (for useSyncExternalStore) --------------------------------------------------
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  getVersion = (): number => this.version;
  private touch(): void {
    // An opened operation shows its keypad with the check as soon as something was changed.
    if (this.compact && JSON.stringify(this.draft) !== this.snapshot) this.compact = false;
    this.version++;
    this.listeners.forEach((l) => l());
  }
  // Changes the draft (immutably) and tells the views.
  update(patch: Partial<EditorDraft>): void {
    this.draft = { ...this.draft, ...patch };
    this.touch();
  }
  expand(): void {
    this.compact = false;
    this.touch();
  }

  private get data(): LedgerData {
    return this.deps.data();
  }

  // ---- Who takes part --------------------------------------------------------------------------
  parties(): Parties {
    const data = this.data;
    const d = this.draft;
    const from = accountById(data, d.from);
    const to = accountById(data, d.to);
    const category = categoryById(data, d.category);
    const isTransfer = d.type === "transfer";
    const isAdjustment = d.type === "adjustment";
    const isIncome = d.type === "income";
    const party = (x: { id: string; name: string; icon: string; color: string; currency: string } | undefined): Party | undefined => (x ? { id: x.id, name: x.name, icon: x.icon, color: x.color, currency: x.currency } : undefined);
    // A subcategory is chosen on a row under the tiles; the tile itself always shows its category.
    const rootCategory = category?.parent ? categoryById(data, category.parent) : category;
    const root = party(rootCategory);
    const subcategories = rootCategory && data.settings.subcategories ? data.categories.filter((x) => x.parent === rootCategory.id && !x.archived).map((x) => party(x) as Party) : [];
    const raise = isAdjustment && Boolean(d.to);
    const own = from || to;
    const main = data.settings.currency;
    const pseudo: Party = { ...ADJUSTMENT, currency: main };

    let source = party(from);
    let target = root;
    if (isAdjustment) [source, target] = raise ? [pseudo, party(to)] : [party(from), pseudo];
    else if (isTransfer) [source, target] = [party(from), party(to)];
    else if (isIncome) [source, target] = [root, party(to)];

    const adjustmentSide = { currency: main, color: ADJUSTMENT.color };
    const primary = isAdjustment ? (raise ? adjustmentSide : own) : own;
    const secondary = isAdjustment ? (raise ? own : adjustmentSide) : isTransfer ? to : category;
    const dual = Boolean(primary && secondary && primary.currency !== secondary.currency);
    const accountCurrency = own?.currency || main;
    // The amount can be typed in another currency; it is converted to the account's one on saving.
    const canPickCurrency = !dual && (d.type === "income" || d.type === "expense");
    const currency = (canPickCurrency && d.entryCurrency) || accountCurrency;
    return { isTransfer, isAdjustment, raise, root, subcategories, source, target, primary, secondary, dual, accountCurrency, canPickCurrency, currency };
  }

  // The own account of the operation (the one whose balance changes).
  ownAccount(): Account | undefined {
    return accountById(this.data, this.draft.from || this.draft.to);
  }

  putCategory(incoming: boolean, categoryId: string): void {
    const data = this.data;
    this.draft = { ...this.draft, ...putCategoryOnSide(data, this.draft, incoming, categoryId) };
    this.afterPartiesChange();
  }
  putAccount(incoming: boolean, accountId: string): void {
    this.draft = { ...this.draft, ...putAccountOnSide(this.data, this.draft, incoming, accountId) };
    this.afterPartiesChange();
  }
  // Replaces the account of a balance correction or, if the operation has only one, that one.
  replaceOwnAccount(id: string): void {
    this.update(this.draft.to ? { to: id } : { from: id });
    this.afterPartiesChange();
  }
  pickSubcategory(id: string, rootId: string): void {
    this.update({ category: this.draft.category === id ? rootId : id });
  }
  private afterPartiesChange(): void {
    this.typedReceive = undefined;
    this.touch();
  }

  // ---- Amounts ---------------------------------------------------------------------------------
  private typing(): string {
    return this.calculatorOn ? this.calculatorExpression : this.draft.expr;
  }
  // Amount on the sender side; zero while the expression is incomplete.
  sentAmount(): number {
    try {
      return evaluateExpression(this.typing());
    } catch {
      return 0;
    }
  }
  private sourceToReceive = (cents: number, parties = this.parties()): number => convert(cents, parties.primary?.currency, parties.secondary?.currency, this.data.rates);
  private receiveToSource = (cents: number, parties = this.parties()): number => convert(cents, parties.secondary?.currency, parties.primary?.currency, this.data.rates);
  convertSentToReceive = (cents: number): number => this.sourceToReceive(cents);

  receiveExpression(): string {
    const d = this.draft;
    // An operation that is opened keeps the amount it received until the sent amount is edited.
    if (d.receiveManual && Number.isSafeInteger(d.receive)) return asDecimal(d.receive as number);
    try {
      return asDecimal(this.sourceToReceive(evaluateExpression(this.typing())));
    } catch {
      return "0";
    }
  }
  // The expression of the side the keypad edits.
  expression(): string {
    return this.parties().dual && this.activeSide === "receive" ? (this.typedReceive ?? this.receiveExpression()) : this.typing();
  }
  // What a side shows: the typed text of the active side, the derived one of the other.
  shown(side: Side): string {
    if (side === "send") return this.activeSide === "send" ? this.expression() : this.typing();
    return this.activeSide === "receive" ? this.expression() : this.receiveExpression();
  }
  // Both amounts as they are now, in minor units.
  amounts(): Record<Side, number> {
    let receive = 0;
    try {
      receive = evaluateExpression(this.receiveExpression());
    } catch {
      // an incomplete expression counts as zero
    }
    return { send: this.sentAmount(), receive };
  }

  selectSide(side: Side): void {
    this.activeSide = side;
    this.typedReceive = side === "receive" ? this.shown("receive") : undefined;
    this.compact = false;
    this.touch();
  }

  private setSentExpression(value: string): void {
    if (this.calculatorOn) {
      this.calculatorExpression = value;
      this.resultReady = false;
    } else this.draft = { ...this.draft, expr: value };
  }

  private typeReceive(value: string): void {
    const before = this.amounts();
    this.typedReceive = value;
    this.resultReady = false;
    try {
      const cents = evaluateExpression(value);
      this.leader = leadingSide(this.leader, "receive", before);
      // The leading side sets the other one; otherwise both amounts stay as they were typed.
      if (this.leader === "receive") this.setSentExpression(asDecimal(this.receiveToSource(cents)));
      this.draft = { ...this.draft, receive: cents, receiveManual: true };
    } catch {
      // keep the previous value while the expression is incomplete
    }
  }

  private typeSent(value: string): void {
    if (!this.calculatorOn && OPERATORS.test(value)) {
      this.deps.say("Enable calculator for arithmetic");
      return;
    }
    const before = this.amounts();
    this.setSentExpression(value);
    this.typedReceive = undefined;
    if (!this.parties().dual) {
      this.draft = { ...this.draft, receiveManual: false };
      return;
    }
    // The leading side sets the other one; otherwise the received amount stays as it was typed.
    this.leader = leadingSide(this.leader, "send", before);
    this.draft = { ...this.draft, receive: before.receive, receiveManual: this.leader !== "send" };
  }

  type(value: string): void {
    if (this.parties().dual && this.activeSide === "receive") this.typeReceive(value);
    else this.typeSent(value);
    this.touch();
  }

  // Take the whole available balance as the sent amount.
  fill(cents: number): void {
    this.draft = { ...this.draft, expr: asDecimal(cents), receiveManual: false };
    this.typedReceive = undefined;
    this.leader = "send";
    this.touch();
  }

  // The most that can be spent from the sender's account (its balance and a card's limit).
  availableToFill(): number | "no-account" | "none" {
    const account = accountById(this.data, this.draft.from);
    if (!account) return "no-account";
    const available = Math.max(0, accountBalance(this.data, account.id) + (account.type === "Regular" ? account.limit || 0 : 0));
    return available ? available : "none";
  }

  // A key of the keypad.
  press(key: string): void {
    if (!this.calculatorOn && ARITHMETIC.includes(key)) {
      this.deps.say("Double-tap the calculator key to enable calculations");
      return;
    }
    if (key === "⌫" || key === "C") this.type(typeKey(this.expression(), key));
    else if (key === "=") {
      try {
        this.type(typeKey(this.expression(), key));
        this.resultReady = true;
        this.touch();
      } catch (error) {
        this.deps.say(error instanceof Error ? error.message : "Enter a valid amount");
      }
    } else {
      // After a computed result, a digit starts a new calculation; an operator continues it.
      const startNew = this.calculatorOn && this.resultReady && /[0-9.]/.test(key);
      this.type(typeKey(this.expression(), key, startNew));
    }
  }

  toggleCalculator(): void {
    this.calculatorOn = !this.calculatorOn;
    this.deps.say(this.calculatorOn ? "Calculator is on" : "Calculator is off");
    // The calculator works on a copy: the operation changes only when it is saved.
    if (this.calculatorOn) {
      this.calculatorExpression = String(this.draft.expr || "0");
      this.resultReady = false;
    }
    this.typedReceive = undefined;
    this.touch();
  }

  // The rate of this operation, and the current one when the amounts do not follow it.
  rateNote(): { operation: [string, string, number]; today: [string, string, number] | null } | null {
    const parties = this.parties();
    const { primary, secondary } = parties;
    const now = this.amounts();
    if (!primary || !secondary || !now.send || !now.receive) return null;
    const quote = (have: string, want: string, r: number): [string, string, number] => (r >= 1 ? [have, want, r] : [want, have, 1 / r]);
    const pair: [[number, string], [number, string]] = [[now.send, primary.currency], [now.receive, secondary.currency]];
    const operation = quote(primary.currency, secondary.currency, now.receive / now.send);
    const off = offRate(pair, this.data.rates);
    return { operation, today: off ? quote(primary.currency, secondary.currency, ratio(primary.currency, secondary.currency, this.data.rates)) : null };
  }

  // ---- Saving ----------------------------------------------------------------------------------
  // The operation to store, after the checks the first application made before saving. Throws a
  // DomainError whose message is for the person.
  prepare(): { op: EditorDraft; schedule: boolean } {
    const data = this.data;
    const d = { ...this.draft };
    if (!this.calculatorOn && OPERATORS.test(String(d.expr).replace(/^-/, ""))) throw new DomainError("Enable calculator for arithmetic");
    if (d.type === "transfer" && (!d.from || !d.to)) throw new DomainError("Select both accounts");
    if (d.type === "adjustment" && !(d.from || d.to)) throw new DomainError("Select an account");
    if (!["transfer", "adjustment"].includes(d.type) && !d.category) throw new DomainError("Select a category");
    d.amount = evaluateExpression(d.expr);
    // An amount typed in another currency is kept as entered and converted to the account's currency.
    const account = accountById(data, d.type === "income" ? d.to : d.from);
    const entry = d.entryCurrency;
    delete d.entryCurrency;
    delete d.foreign;
    if (entry && account && entry !== account.currency) {
      d.foreign = { currency: entry, amount: d.amount };
      d.amount = convert(d.amount, entry, account.currency, data.rates);
    }
    return { op: d, schedule: this.scheduled };
  }

  // Will the saved operation wait among the scheduled payments?
  willBePlanned(op: Operation): boolean {
    return this.scheduled || isPlanned(op, systemClock.today());
  }
}

// A fresh draft for a new operation, or a copy of an existing one for editing (the opened operation's
// own amounts are kept: see `receiveManual`).
export function newDraft(data: LedgerData, today: string, options: Partial<EditorDraft> = {}): EditorDraft {
  const draft: EditorDraft = {
    id: "",
    type: "expense",
    from: null,
    to: null,
    category: undefined,
    amount: 0,
    date: today,
    comment: "",
    tags: [],
    photos: [],
    recur: null,
    reminder: null,
    expr: "0",
    ...structuredCloneOf(options),
  };
  if (draft.foreign) {
    // An amount that was typed in another currency is edited as it was entered.
    draft.entryCurrency = draft.foreign.currency;
    draft.expr = asDecimal(draft.foreign.amount);
  } else draft.expr = asDecimal(draft.amount || 0);
  if (!draft.id) return draft;
  if (draft.type === "adjustment" && draft.receive === undefined) {
    // Older corrections have one amount: both sides show it, as they did when it was made.
    const account = accountById(data, draft.from || draft.to);
    if (account && account.currency !== data.settings.currency) draft.receive = draft.amount;
  }
  const stored = draft.categoryAmount;
  if (stored && stored.currency === categoryById(data, draft.category)?.currency) {
    // The amount in the category's currency is the second amount of the editor.
    draft.receive = stored.amount;
    draft.receiveManual = true;
  } else if (draft.receive !== undefined && !draft.fees?.length) draft.receiveManual = true;
  return draft;
}

const structuredCloneOf = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// What the editor has to ask for before it opens (js/screens/operation-editor/start.js): the
// accounts or the category that a new operation still lacks.
export type Missing = "transfer-from" | "transfer-to" | "account" | "category" | null;
export function whatIsMissing(draft: EditorDraft): Missing {
  if (draft.type === "transfer" && !draft.from) return "transfer-from";
  if (draft.type === "transfer" && !draft.to) return "transfer-to";
  if (!draft.from && !draft.to) return "account";
  if (!draft.category && draft.type !== "adjustment" && draft.type !== "transfer") return "category";
  return null;
}

export { defaultAccountId };
