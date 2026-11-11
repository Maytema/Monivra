// The operation editor as a sheet (js/screens/operation-editor/{view,keypad,amount,parties,extras,
// actions}.js): date, the two tiles, the amount (two amounts when currencies differ), comment and tags,
// tax and commission, and the keypad — or, for an opened operation, its actions. All state and rules
// live in `EditorSession`; this file only draws it and forwards taps.
import { useRef, useSyncExternalStore, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { addDays, parseDate } from "../../domain/dates.ts";
import { defaultAccountId } from "../../domain/ledger.ts";
import { applyFees } from "../../domain/money.ts";
import { deleteOperations, earliestScheduleDate, isFarDate, putOperation, rememberTags } from "../../domain/operations.ts";
import { processScheduled } from "../../domain/scheduled.ts";
import type { Fee, LedgerData } from "../../domain/types.ts";
import { keypadDigits } from "../../domain/keypad.ts";
import { DomainError } from "../../domain/errors.ts";
import { appStore, useCommand, useLedger, useMoney, usePalette, useT } from "../../ui/app-context.tsx";
import { openCalendar } from "../../ui/calendar-sheet.tsx";
import { openCurrencySheet } from "../../ui/currency-sheet.tsx";
import { confirmDialog, promptDialog, toast } from "../../ui/dialogs.tsx";
import { Icon } from "../../ui/kit.tsx";
import { ActionGrid, ActionTile, ToneBadge } from "../../ui/parts.tsx";
import { sheets, useCloseLayer } from "../../ui/sheets.tsx";
import { alpha, mix } from "../../ui/theme.ts";
import { feeLabel, openFee, openRecurrence, openReminder, openTags, openTime, optionsSet, setPaymentTime } from "./options.tsx";
import { openPartyPicker } from "./party-picker.tsx";
import { EditorSession, newDraft, type EditorDraft, type Party } from "./session.ts";

const DOUBLE_TAP_MS = 340;
const MENU_DELAY_MS = 350;

export interface EditorStart {
  // An opened operation (or scheduled payment).
  id?: string;
  scheduled?: boolean;
  // A new one: what it starts from.
  type?: EditorDraft["type"];
  category?: string;
  from?: string | null;
  to?: string | null;
  // A copy of an operation that was already filled in.
  copy?: Partial<EditorDraft>;
  // What a scheduled payment has been given before the editor opens (date, time, repeat, reminder).
  preset?: Partial<EditorDraft>;
}

const ledger = (): LedgerData => {
  const state = appStore().getState();
  if (state.status !== "ready") throw new Error("The data is not open");
  return state.data;
};

export function openEditor(start: EditorStart): number | null {
  const data = ledger();
  const env = appStore().env;
  const scheduled = start.scheduled === true;
  const found = start.id ? (scheduled ? data.scheduled : data.ops).find((o) => o.id === start.id) : undefined;
  const type = start.type ?? "expense";
  const fallback = defaultAccountId(data);
  const base: Partial<EditorDraft> =
    found ??
    start.copy ?? {
      type,
      category: start.category,
      from: type === "income" ? null : (start.from ?? fallback ?? null),
      to: type === "income" ? (start.to ?? fallback ?? null) : (start.to ?? null),
    };
  const draft = newDraft(data, env.clock.today(), { ...(base as Partial<EditorDraft>), ...(found ? {} : start.preset) });
  const session = new EditorSession(draft, scheduled, { data: ledger, say: toast });
  return sheets.open(<EditorSheet session={session} />, "sheet", { bare: true });
}

// ---- Pieces --------------------------------------------------------------------------------------
function IconButton({ name, label, onPress, disabled = false, size = 22 }: { name: string; label: string; onPress: () => void; disabled?: boolean; size?: number }) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} hitSlop={6} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : 1 }}>
      <Icon name={name} size={size} color={p.ink} />
    </Pressable>
  );
}

function DateRow({ session }: { session: EditorSession }) {
  const p = usePalette();
  const t = useT();
  const today = appStore().env.clock.today();
  const earliest = session.scheduled ? earliestScheduleDate(today) : null;
  const date = session.draft.date;
  const label = `${parseDate(date).toLocaleDateString(t.locale, { weekday: "long", timeZone: "UTC" })}, ${t.day(date, true)}`;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", height: session.compact ? 48 : 52, marginBottom: session.compact ? 8 : 9 }}>
      <IconButton name="left" label="Previous day" disabled={!!earliest && date <= earliest} onPress={() => session.update({ date: addDays(date, -1) })} />
      <Pressable accessibilityRole="button" onPress={() => openCalendar(date, (value) => session.update({ date: value }), earliest)} style={{ flex: 1, alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Icon name="calendar" size={16} color={p.ink} />
        <Text style={{ color: p.ink, fontSize: 16, fontWeight: "500" }} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
      <IconButton name="right" label="Next day" onPress={() => session.update({ date: addDays(date, 1) })} />
    </View>
  );
}

function PartyTile({ caption, party, second, onPress }: { caption: string; party: Party | undefined; second: boolean; onPress: () => void }) {
  const p = usePalette();
  const t = useT();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ flex: 1, minWidth: 0, minHeight: 80, padding: 12, paddingHorizontal: 11, gap: 11, borderRadius: 17, borderWidth: 1, borderColor: second ? mix(p.accent, p.line, 0.6) : p.muted, backgroundColor: mix(p.accent, p.bg, 0.12) }}
    >
      <Text style={{ color: p.ink, fontSize: 14, fontWeight: "600" }}>{t.t(caption)}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
        {party ? <ToneBadge icon={party.icon} color={party.color} size={26} iconSize={15} radius={13} /> : null}
        <Text numberOfLines={1} style={{ flex: 1, color: p.ink, fontSize: 18 }}>
          {party ? party.name : t.t("Not selected")}
        </Text>
      </View>
    </Pressable>
  );
}

function Parties({ session }: { session: EditorSession }) {
  const p = usePalette();
  const d = session.draft;
  const parties = session.parties();
  const { isTransfer, isAdjustment, raise, source, target, root, subcategories } = parties;
  const sourceCaption = !isTransfer && !isAdjustment && d.type === "income" ? "Category" : "Account";
  const targetCaption = isAdjustment ? "Account" : !isTransfer && d.type === "expense" ? "Category" : "Account";
  return (
    <View>
      <View style={{ flexDirection: "row", gap: 9, marginTop: 5, marginBottom: session.compact ? 12 : 10 }}>
        <PartyTile caption={sourceCaption} party={source} second={false} onPress={() => openPartyPicker(session, true, isAdjustment && !raise)} />
        <PartyTile caption={targetCaption} party={target} second onPress={() => openPartyPicker(session, false, isAdjustment && raise)} />
      </View>
      {subcategories.length && root ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {subcategories.map((x) => {
            const on = d.category === x.id;
            return (
              <Pressable key={x.id} accessibilityState={{ selected: on }} onPress={() => session.pickSubcategory(x.id ?? "", root.id ?? "")} style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: mix(p.accent, p.line, 0.6), backgroundColor: on ? mix(p.accent, p.bg, 0.18) : "transparent" }}>
                <Text style={{ color: p.accentInk, fontSize: 15, fontWeight: on ? "600" : "400" }}>{x.name}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

// One amount of a cross-currency operation; tapping it makes the keypad type there.
function DualAmount({ session, side, party }: { session: EditorSession; side: "send" | "receive"; party: { currency: string; color?: string } }) {
  const p = usePalette();
  const active = session.activeSide === side;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={() => {
        session.selectSide(side);
        session.expand();
      }}
      style={{ minHeight: 56, marginHorizontal: -16, alignItems: "center", justifyContent: "center", borderBottomWidth: 1, borderBottomColor: p.line, backgroundColor: active ? alpha(party.color ?? p.tint, 0.14) : "transparent" }}
    >
      <Text style={{ color: p.ink, fontSize: 32 }}>
        {session.shown(side)} {party.currency}
      </Text>
    </Pressable>
  );
}

function Amount({ session }: { session: EditorSession }) {
  const p = usePalette();
  const t = useT();
  const parties = session.parties();
  if (parties.dual && parties.primary && parties.secondary) {
    const note = session.rateNote();
    const rate = (r: [string, string, number]) => Number(r[2].toFixed(r[2] >= 100 ? 2 : 4)).toString();
    return (
      <View>
        <DualAmount session={session} side="send" party={parties.primary} />
        <DualAmount session={session} side="receive" party={parties.secondary} />
        {note ? (
          <Text style={{ color: p.muted, fontSize: 13, textAlign: "center", paddingVertical: 8 }}>
            {t.t("Operation rate: 1 {from} = {rate} {to}", { from: note.operation[0], rate: rate(note.operation), to: note.operation[1] })}
            {note.today ? `\n${t.t("Rate today: 1 {from} = {rate} {to}", { from: note.today[0], rate: rate(note.today), to: note.today[1] })}` : ""}
          </Text>
        ) : null}
      </View>
    );
  }
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: session.compact ? 64 : 76, paddingVertical: session.compact ? 3 : 0 }}>
      <Text accessibilityLabel={session.calculatorOn ? "Calculator expression" : "Amount"} style={{ color: p.ink, fontSize: 38 }}>
        {session.expression()}
      </Text>
      <Text style={{ color: p.ink, fontSize: 38 }}>{parties.currency}</Text>
    </View>
  );
  return session.compact ? (
    <Pressable accessibilityRole="button" onPress={() => session.expand()}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

function Extras({ session }: { session: EditorSession }) {
  const p = usePalette();
  const t = useT();
  const d = session.draft;
  const editComment = () => promptDialog("Comment", d.comment, (value) => session.update({ comment: value }), "Comment");
  const editTags = () => openTags(d.tags, (tags) => session.update({ tags }));
  return (
    <View>
      {d.comment ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6 }}>
          <Pressable accessibilityLabel={t.t("Comment")} onPress={editComment} style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: p.ink, fontSize: 16 }}>
              {d.comment}
            </Text>
          </Pressable>
          <IconButton name="close" label="Clear comment" size={18} onPress={() => session.update({ comment: "" })} />
        </View>
      ) : null}
      <View style={{ flexDirection: "row", justifyContent: "space-around", alignItems: "center", minHeight: session.compact ? 46 : 51, borderBottomWidth: 1, borderBottomColor: p.line }}>
        <IconButton name="comment" label="Comment" onPress={editComment} />
        <IconButton name="tag" label="Tags" onPress={editTags} />
      </View>
      {d.tags.length ? (
        <Pressable accessibilityLabel={t.t("Tags")} onPress={editTags} style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingVertical: 8 }}>
          {d.tags.map((tag) => (
            <View key={tag} style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: p.tint }}>
              <Text style={{ color: p.ink, fontSize: 14 }}>{tag}</Text>
            </View>
          ))}
        </Pressable>
      ) : null}
    </View>
  );
}

// "Tax (−5 %): −25 KGS" with a switch between subtracting and adding, and a remove button.
function FeeLines({ session }: { session: EditorSession }) {
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  const fees = session.draft.fees ?? [];
  if (!fees.length) return null;
  const { steps } = applyFees(session.sentAmount(), fees);
  const parties = session.parties();
  const currency = parties.accountCurrency;
  const set = (next: Fee[]) => session.update({ fees: next });
  return (
    <View style={{ gap: 6, paddingVertical: 8 }}>
      {steps.map(({ fee, delta }) => {
        const size = fee.percent && fee.percent > 0 ? `${fee.percent} %` : String(fee.value);
        return (
          <View key={fee.kind} style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: p.muted, borderRadius: 14, paddingLeft: 14 }}>
            <Text numberOfLines={1} style={{ flex: 1, color: p.ink, fontSize: 15 }}>
              {t.t(fee.kind === "tax" ? "Tax" : "Commission")} ({fee.add ? "+" : "−"}
              {size}): {delta > 0 ? "+" : "−"}
              {money(Math.abs(delta), currency)}
            </Text>
            <IconButton name="swap" label="Subtract / add" size={18} onPress={() => set(session.draft.fees!.map((f) => (f.kind === fee.kind ? { ...f, add: !f.add } : f)))} />
            <IconButton name="close" label="Remove" size={18} onPress={() => set(session.draft.fees!.filter((f) => f.kind !== fee.kind))} />
          </View>
        );
      })}
    </View>
  );
}

// ---- Keypad --------------------------------------------------------------------------------------
function Key({ children, onPress, label, style, tone }: { children: ReactNode; onPress?: () => void; label?: string; style?: object; tone?: "confirm" }) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [{ flex: 1, minHeight: 54, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: tone === "confirm" ? mix(p.accent, p.bg, 0.18) : pressed ? mix(p.accent, p.bg, 0.1) : p.key }, style]}
    >
      {children}
    </Pressable>
  );
}

function Keypad({ session, onSave }: { session: EditorSession; onSave: (calculated: boolean) => void }) {
  const p = usePalette();
  const t = useT();
  const data = useLedger();
  const lastTap = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const parties = session.parties();
  const digits = keypadDigits(data.settings.reverseKeys ?? false);
  const text = (key: string, size = 29) => <Text style={{ color: p.ink, fontSize: size }}>{key}</Text>;
  const press = (key: string) => () => session.press(key);

  const additional = () => sheets.open(<Additional session={session} />, "sheet");
  const modeTap = () => {
    const now = Date.now();
    if (timer.current) clearTimeout(timer.current);
    if (lastTap.current && now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      session.toggleCalculator();
      return;
    }
    lastTap.current = now;
    timer.current = setTimeout(() => {
      lastTap.current = 0;
      additional();
    }, MENU_DELAY_MS);
  };

  const count = optionsSet(session.draft);
  const confirm = !session.calculatorOn ? (
    <Key tone="confirm" label="Save operation" onPress={() => onSave(false)} style={{ flex: 2 }}>
      <Icon name="check" size={30} color={p.accentInk} />
    </Key>
  ) : session.resultReady ? (
    <Key tone="confirm" label="Save operation with calculated result" onPress={() => onSave(true)} style={{ flex: 2 }}>
      <Icon name="check" size={30} color={p.accentInk} />
    </Key>
  ) : (
    <Key tone="confirm" label="Calculate equals without saving" onPress={press("=")} style={{ flex: 2 }}>
      <Text style={{ color: p.accentInk, fontSize: 32, fontWeight: "500" }}>=</Text>
    </Key>
  );
  const column = (...keys: ReactNode[]) => <View style={{ flex: 1, gap: 8 }}>{keys}</View>;
  const [d0, d1, d2, d3, d4, d5, d6, d7, d8] = digits as [string, string, string, string, string, string, string, string, string];
  const currencyKey = parties.canPickCurrency ? (
    <Key label={t.t("Currency")} onPress={() => openCurrencySheet(parties.currency, (id) => session.update({ entryCurrency: id === parties.accountCurrency ? undefined : id }))}>
      {text(parties.currency, 18)}
    </Key>
  ) : (
    <Key>{text(parties.currency, 18)}</Key>
  );
  return (
    <View style={{ flexDirection: "row", gap: 8, marginTop: 9, marginHorizontal: -10 }}>
      {column(
        <Key key="÷" onPress={press("÷")}>
          {text("÷")}
        </Key>,
        <Key key="×" onPress={press("×")}>
          {text("×")}
        </Key>,
        <Key key="−" onPress={press("−")}>
          {text("−")}
        </Key>,
        <Key key="+" onPress={press("+")}>
          {text("+")}
        </Key>,
      )}
      {column(
        <Key key={d0} onPress={press(d0)}>{text(d0)}</Key>,
        <Key key={d3} onPress={press(d3)}>{text(d3)}</Key>,
        <Key key={d6} onPress={press(d6)}>{text(d6)}</Key>,
        currencyKey,
      )}
      {column(
        <Key key={d1} onPress={press(d1)}>{text(d1)}</Key>,
        <Key key={d4} onPress={press(d4)}>{text(d4)}</Key>,
        <Key key={d7} onPress={press(d7)}>{text(d7)}</Key>,
        <Key key="0" onPress={press("0")}>{text("0")}</Key>,
      )}
      {column(
        <Key key={d2} onPress={press(d2)}>{text(d2)}</Key>,
        <Key key={d5} onPress={press(d5)}>{text(d5)}</Key>,
        <Key key={d8} onPress={press(d8)}>{text(d8)}</Key>,
        <Key key="." onPress={press(".")}>{text(".")}</Key>,
      )}
      <View style={{ flex: 1, gap: 8 }}>
        <Key label="Backspace" onPress={press("⌫")}>
          <Icon name="backspace" size={26} color={p.ink} />
        </Key>
        <Key label="Additionally" onPress={modeTap} style={{ backgroundColor: session.calculatorOn ? mix(p.accent, p.bg, 0.18) : p.key }}>
          <Icon name="calculator" size={26} color={session.calculatorOn ? p.accentInk : p.ink} />
          {count ? (
            <View style={{ position: "absolute", top: 4, right: 6, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: mix(p.accent, p.bg, 0.3), alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: p.accentInk, fontSize: 12, fontWeight: "600" }}>{count}</Text>
            </View>
          ) : null}
        </Key>
        {confirm}
      </View>
    </View>
  );
}

// "Additionally": everything the keypad cannot show.
function Additional({ session }: { session: EditorSession }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const version = useSyncExternalStore(session.subscribe, session.getVersion);
  void version;
  const d = session.draft;
  const row = (title: string, icon: string, hint: string, onPress: () => void) => (
    <Pressable key={title} accessibilityRole="button" onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 16, minHeight: 62, paddingHorizontal: 4 }}>
      <Icon name={icon} size={24} color={p.ink} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: p.ink, fontSize: 16 }}>{t.t(title)}</Text>
        <Text style={{ color: p.muted, fontSize: 13 }} numberOfLines={1}>
          {hint}
        </Text>
      </View>
    </Pressable>
  );
  const fillMax = () => {
    const available = session.availableToFill();
    if (available === "no-account") return toast("Select sender account");
    if (available === "none") return toast("No available balance");
    session.fill(available);
    close();
  };
  const reminderText = d.reminder ? (d.reminder.before === 0 ? t.t("On the same day at {time}", { time: d.reminder.time }) : `${d.reminder.before} ${d.reminder.unit} · ${d.reminder.time}`) : t.t("Turned off");
  const recurText = d.recur ? `${t.t(d.recur.unit)} × ${d.recur.every}${d.recur.remaining === null ? "" : ` (${t.t("Remaining: {n}", { n: d.recur.remaining })})`}` : t.t("Turned off");
  const fee = (kind: Fee["kind"]) => {
    const label = feeLabel(d.fees, kind);
    return label === "Turned off" ? t.t(label) : label;
  };
  return (
    <View>
      <Text style={{ color: p.ink, fontSize: 25, fontWeight: "500", textAlign: "center", marginTop: 6, marginBottom: 8 }}>{t.t("Additionally")}</Text>
      {row("Fill max", "wallet", t.t("Use full sender account balance"), fillMax)}
      {session.scheduled ? row("Time", "clock", d.time ?? appStore().env.clock.time(), () => openTime(d.time ?? appStore().env.clock.time(), (time) => setPaymentTime(session, time))) : null}
      {row("Reminder", "bell", reminderText, () => openReminder(d.reminder ?? null, d.time, (reminder) => session.update({ reminder })))}
      {row("Recur", "repeat", recurText, () => openRecurrence(d.recur ?? null, (recur) => session.update({ recur })))}
      {row("Tax", "receipt", fee("tax"), () => openFee("tax", d.fees ?? [], (fees) => session.update({ fees })))}
      {row("Commission", "percent", fee("commission"), () => openFee("commission", d.fees ?? [], (fees) => session.update({ fees })))}
    </View>
  );
}

// ---- Actions of an opened operation --------------------------------------------------------------
function Actions({ session }: { session: EditorSession }) {
  const p = usePalette();
  const run = useCommand();
  const d = session.draft;
  const copy = () => {
    const clone: Partial<EditorDraft> = JSON.parse(JSON.stringify(d));
    delete clone.id;
    delete clone.fromSchedule;
    const earliest = earliestScheduleDate(appStore().env.clock.today());
    if (session.scheduled && (clone.date ?? "") < earliest) clone.date = earliest;
    sheets.closeAll();
    openEditor({ copy: clone, scheduled: session.scheduled });
  };
  const remove = () =>
    confirmDialog(
      "Delete this operation?",
      () => {
        if (run((tx) => (deleteOperations(tx, [d.id], session.scheduled), true))) sheets.closeAll();
      },
      true,
      "Delete",
    );
  const settle = (post: boolean) => {
    if (run((tx, e) => (processScheduled(tx, d.id, post, e), true))) {
      sheets.closeAll();
      toast(post ? "Payment added" : "Payment skipped");
    }
  };
  return (
    <ActionGrid>
      <ActionTile icon="trash" label="Delete" tone={p.negative} onPress={remove} />
      <ActionTile icon="copy" label="Duplicate" tone="#c04fd8" onPress={copy} />
      {session.scheduled ? (
        <>
          <ActionTile icon="close" label="Skip" tone={p.negative} onPress={() => confirmDialog("Skip this occurrence?", () => settle(false), false, "Skip")} />
          <ActionTile icon="check" label="Add now" tone={p.positive} onPress={() => settle(true)} />
        </>
      ) : null}
    </ActionGrid>
  );
}

// ---- The sheet -----------------------------------------------------------------------------------
function EditorSheet({ session }: { session: EditorSession }) {
  const t = useT();
  const run = useCommand();
  const close = useCloseLayer();
  useSyncExternalStore(session.subscribe, session.getVersion);
  const confirmedDate = useRef<string | undefined>(undefined);
  const env = appStore().env;

  const save = (calculated: boolean) => {
    try {
      if (calculated) session.update({ expr: session.calculatorExpression });
      const { op, schedule } = session.prepare();
      const store = () => {
        const result = run((tx, e) => {
          rememberTags(tx, op.tags);
          return putOperation(tx, op, e, schedule || !!op.recur);
        });
        if (!result) return;
        close();
        if (result.planned) toast("Payment scheduled");
      };
      if (confirmedDate.current !== op.date && isFarDate(op.date, env.clock.today())) {
        confirmDialog(t.t("The date {date} is more than a year from today. Save anyway?", { date: t.day(op.date, true) }), () => ((confirmedDate.current = op.date), store()), false, "Save");
      } else store();
    } catch (error) {
      if (error instanceof DomainError) toast(t.t(error.message, error.params));
      else if (error instanceof Error) toast(t.t(error.message));
      else throw error;
    }
  };

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
      <DateRow session={session} />
      <Parties session={session} />
      <Amount session={session} />
      <Extras session={session} />
      <FeeLines session={session} />
      {session.compact ? <Actions session={session} /> : <Keypad session={session} onSave={save} />}
    </View>
  );
}
