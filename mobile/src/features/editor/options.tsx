// The dialogs behind the editor's "Additionally" sheet (js/screens/{fees,recurrence}.js and
// operation-editor/{keypad,extras}.js): tax and commission, how a payment repeats, its reminder, the
// time of a payment, tags. Each one edits a copy and gives it back when OK is pressed.
import { useState } from "react";
import { Keyboard, Text, TextInput, View } from "react-native";
import { Pressable } from "../../ui/pressable.tsx";
import { feeOfKind, withFee } from "../../domain/money.ts";
import { comesAfterPayment, reminderForTime } from "../../domain/scheduled.ts";
import type { Fee, IntervalUnit, Recurrence, Reminder } from "../../domain/types.ts";
import { useLedger, usePalette, useT } from "../../ui/app-context.tsx";
import { PrimaryPill, TextButton } from "../../ui/calendar-sheet.tsx";
import { DialogActions, DialogTitle, optionDialog, promptDialog, confirmDialog, toast } from "../../ui/dialogs.tsx";
import { Icon } from "../../ui/kit.tsx";
import { useCommand } from "../../ui/app-context.tsx";
import { openTime, timeLabel } from "../../ui/time-dialog.tsx";
export { openTime };
import { sheets, useCloseLayer } from "../../ui/sheets.tsx";
import { deleteTag, rememberTags, renameTag } from "../../domain/operations.ts";
import type { EditorSession, EditorDraft } from "./session.ts";
import { openReminderHelp } from "./help-texts.tsx";

const MAX_INTERVAL = 365;
const UNITS: IntervalUnit[] = ["Days", "Weeks", "Months", "Years"];
const SINGULAR: Record<IntervalUnit, string> = { Days: "Day", Weeks: "Week", Months: "Month", Years: "Year" };
const unitName = (unit: IntervalUnit, n: number): string => (n === 1 ? SINGULAR[unit] : unit);
const within = (n: number, min: number): number => Math.min(MAX_INTERVAL, Math.max(min, n));

// ---- Labels (the text under a row of "Additionally") --------------------------------------------
export function feeLabel(fees: readonly Fee[] | undefined, kind: Fee["kind"]): string {
  const fee = feeOfKind(fees, kind);
  if (!fee) return "Turned off";
  const size = fee.percent && fee.percent > 0 ? `${fee.percent} %` : String(fee.value);
  return (fee.add ? "+" : "−") + size;
}
export const optionsSet = (draft: EditorDraft): number => (draft.reminder ? 1 : 0) + (draft.recur ? 1 : 0) + (draft.fees?.length ?? 0);

// ---- Pieces --------------------------------------------------------------------------------------
function FieldTitle({ children }: { children: string }) {
  const p = usePalette();
  const t = useT();
  return <Text style={{ color: p.inkSoft, fontSize: 19, marginTop: 14, marginBottom: 8 }}>{t.t(children)}</Text>;
}

// A value between two arrows: the arrows change it by one, tapping the value types it in on the number pad. An arrow
// that cannot go further is dimmed. One rounded outline; inside it the arrow cells (a fifth of the width each) and the
// value cell (three fifths) are told apart by thin vertical lines (the owner's photo of the Reminder dialog, 2026-11-22).
function Stepper({ label, text, onStep, onType, atMin, atMax }: { label: string; text: string; onStep: (k: number) => void; onType: (value: string) => void; atMin: boolean; atMax: boolean }) {
  const p = usePalette();
  const t = useT();
  const [draft, setDraft] = useState<string | null>(null);
  const arrow = (name: "left" | "right", step: number, disabled: boolean, description: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.t(description)}
      disabled={disabled}
      onPress={() => onStep(step)}
      style={({ pressed }) => ({ flex: 1, alignSelf: "stretch", alignItems: "center", justifyContent: "center", borderRadius: 16, opacity: disabled ? 0.35 : 1, backgroundColor: pressed ? p.soft : "transparent" })}
    >
      <Icon name={name} size={22} color={p.ink} />
    </Pressable>
  );
  return (
    <View>
      <FieldTitle>{label}</FieldTitle>
      {/* The rounded outline holds the arrows; the value stands in a box of its own (thin line, small corners) between them. */}
      <View style={{ flexDirection: "row", alignItems: "stretch", height: 54, marginBottom: 4, borderWidth: 1, borderColor: p.muted, borderRadius: 18 }}>
        {arrow("left", -1, atMin, "Decrease")}
        <TextInput
          accessibilityLabel={t.t(label)}
          value={draft ?? text}
          // Tapping the value types into it on the system number keyboard: the cell is outlined, the caret blinks, and the
          // caret stands after the digits there are (a ∞ or another word is cleared at once, so a number is typed anew).
          onFocus={() => setDraft(/^\d+$/.test(text) ? text : "")}
          onChangeText={(v) => {
            // The value is kept at every key, so the OK that follows needs no blur first.
            const digits = v.replace(/\D/g, "").slice(0, 6);
            setDraft(digits);
            onType(digits);
          }}
          selection={draft === null ? undefined : { start: draft.length, end: draft.length }}
          onBlur={() => setDraft(null)}
          onSubmitEditing={() => Keyboard.dismiss()}
          keyboardType="numeric"
          selectionColor={p.accent}
          cursorColor={p.accent}
          style={{ flex: 3, minWidth: 0, padding: 0, marginTop: -1, marginBottom: -1, borderWidth: draft === null ? 1 : 2, borderColor: draft === null ? p.muted : p.accent, borderRadius: 4, textAlign: "center", color: p.ink, fontSize: 18 }}
        />
        {arrow("right", 1, atMax, "Increase")}
      </View>
    </View>
  );
}

// The current choice of a list as an outlined button (js/ui/primitives.js dropdownHtml).
function Dropdown({ text, onPress }: { text: string; onPress: () => void }) {
  const p = usePalette();
  const t = useT();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ height: 54, marginTop: 14, marginBottom: 4, borderWidth: 1, borderColor: p.muted, borderRadius: 18, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: p.ink, fontSize: 19 }}>{t.t(text)}</Text>
      <View style={{ position: "absolute", right: 16 }}>
        <Icon name="down" size={22} color={p.ink} />
      </View>
    </Pressable>
  );
}

function Footer({ off, ok, offLabel = "Turn off" }: { off?: () => void; ok: () => void; offLabel?: string }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  return (
    <View>
      {off ? (
        <Pressable onPress={off} accessibilityRole="button" style={{ marginTop: 16, alignSelf: "flex-end", minWidth: 96, alignItems: "center", paddingHorizontal: 24, paddingVertical: 11, borderRadius: 999, borderWidth: 1, borderColor: p.accent }}>
          <Text style={{ color: p.accent, fontSize: 15, fontWeight: "600" }}>{t.t(offLabel)}</Text>
        </Pressable>
      ) : null}
      <DialogActions>
        <TextButton label="Cancel" onPress={close} />
        <PrimaryPill label="OK" onPress={ok} minWidth={96} />
      </DialogActions>
    </View>
  );
}

// ---- Time ----------------------------------------------------------------------------------------


// A payment's time; a reminder of the same day that would come after it moves along or is dropped.
export function setPaymentTime(session: EditorSession, time: string, locale: string): void {
  const kept = reminderForTime(session.draft.reminder ?? null, session.draft.time, time);
  if (kept !== (session.draft.reminder ?? null)) toast(kept ? "Reminder moved to {time}" : "Reminder turned off: there is no time left before the payment", kept ? { time: timeLabel(kept.time, locale) } : undefined);
  session.update({ reminder: kept, time });
}

// ---- Tax and commission --------------------------------------------------------------------------
function FeeDialog({ kind, fees, onDone }: { kind: Fee["kind"]; fees: readonly Fee[]; onDone: (fees: Fee[]) => void }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const current = feeOfKind(fees, kind);
  const [percent, setPercent] = useState(current?.percent ? String(current.percent) : "");
  const [value, setValue] = useState(current?.value ? String(current.value) : "");
  const [add, setAdd] = useState(!!current?.add);
  const field = (label: string, text: string, set: (v: string) => void) => (
    <View style={{ marginTop: 10 }}>
      <Text style={{ color: p.muted, fontSize: 12, marginBottom: 4 }}>{t.t(label)}</Text>
      <TextInput value={text} onChangeText={set} keyboardType="decimal-pad" style={{ color: p.ink, fontSize: 16, borderWidth: 1, borderColor: p.muted, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 11 }} />
    </View>
  );
  const choice = (label: string, on: boolean, set: () => void) => (
    <Pressable onPress={set} style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 10 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? p.accent : p.muted, alignItems: "center", justifyContent: "center" }}>{on ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: p.accent }} /> : null}</View>
      <Text style={{ color: p.ink, fontSize: 16 }}>{t.t(label)}</Text>
    </Pressable>
  );
  return (
    <View>
      <DialogTitle>{t.t(kind === "tax" ? "Add tax" : "Add commission")}</DialogTitle>
      {field("Percent", percent, (v) => (setPercent(v), setValue("")))}
      <Text style={{ color: p.muted, textAlign: "center", marginTop: 10 }}>{t.t("Or")}</Text>
      {field("Value", value, (v) => (setValue(v), setPercent("")))}
      <View style={{ marginTop: 8 }}>
        {choice("Subtract from operation", !add, () => setAdd(false))}
        {choice("Add to operation", add, () => setAdd(true))}
      </View>
      <DialogActions>
        <TextButton label="Cancel" onPress={close} />
        <PrimaryPill
          label="OK"
          onPress={() => {
            const pct = Number(percent.replace(",", "."));
            const val = Number(value.replace(",", "."));
            close();
            onDone(pct > 0 || val > 0 ? withFee(fees, kind, { percent: pct > 0 ? pct : 0, value: val > 0 ? val : 0, add }) : withFee(fees, kind, null));
          }}
        />
      </DialogActions>
    </View>
  );
}
export const openFee = (kind: Fee["kind"], fees: readonly Fee[], onDone: (fees: Fee[]) => void): number => sheets.open(<FeeDialog kind={kind} fees={fees} onDone={onDone} />, "dialog");

// ---- How a payment repeats -----------------------------------------------------------------------
function RecurrenceDialog({ value, onDone }: { value: Recurrence | null; onDone: (r: Recurrence | null) => void }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const [r, setR] = useState<Recurrence>(value ?? { every: 1, unit: "Days", remaining: null, days: [] });
  const weekday = (n: number) => t.weekday(n, "short");
  return (
    <View>
      <DialogTitle center>{t.t("Recur")}</DialogTitle>
      <Stepper
        label="Repeat every"
        text={String(r.every)}
        onStep={(k) => setR({ ...r, every: within(r.every + k, 1) })}
        onType={(v) => setR({ ...r, every: within(Number(v) || 1, 1) })}
        atMin={r.every <= 1}
        atMax={r.every >= MAX_INTERVAL}
      />
      <Dropdown
        text={unitName(r.unit, r.every)}
        onPress={() =>
          optionDialog<IntervalUnit>(
            "Choose time period",
            UNITS.map((u) => ({ value: u, label: u, hint: u === "Weeks" ? "Additionally - by days of the week" : undefined })),
            r.unit,
            (unit) => setR({ ...r, unit }),
          )
        }
      />
      {r.unit === "Weeks" ? (
        <View>
          <FieldTitle>Days of the week</FieldTitle>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            {[0, 1, 2, 3, 4, 5, 6].map((day) => {
              const on = r.days.includes(day);
              return (
                <Pressable key={day} accessibilityLabel={weekday(day)} onPress={() => setR({ ...r, days: on ? r.days.filter((n) => n !== day) : [...r.days, day] })} style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: on ? p.accent : "transparent", borderWidth: 1, borderColor: on ? p.accent : p.line }}>
                  <Text style={{ color: on ? p.onAccent : p.ink, fontSize: 14 }}>{weekday(day).slice(0, 1).toUpperCase()}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      <Stepper
        label="Number of repetitions"
        text={r.remaining === null ? "∞" : String(r.remaining)}
        onStep={(k) => setR({ ...r, remaining: r.remaining === null ? (k > 0 ? 1 : null) : r.remaining + k || null })}
        onType={(v) => setR({ ...r, remaining: Number(v) >= 1 ? within(Number(v), 1) : null })}
        atMin={r.remaining === null}
        atMax={r.remaining !== null && r.remaining >= MAX_INTERVAL}
      />
      <Footer
        off={() => {
          close();
          onDone(null);
        }}
        ok={() => {
          if (r.unit === "Weeks" && r.days.length === 0) return toast("Choose at least one weekday");
          close();
          onDone(r);
        }}
      />
    </View>
  );
}
export const openRecurrence = (value: Recurrence | null, onDone: (r: Recurrence | null) => void): number => sheets.open(<RecurrenceDialog value={value} onDone={onDone} />, "dialog");

// ---- Reminder ------------------------------------------------------------------------------------
function ReminderDialog({ value, paymentTime, onDone }: { value: Reminder | null; paymentTime: string | undefined; onDone: (r: Reminder | null) => void }) {
  const t = useT();
  const p = usePalette();
  const close = useCloseLayer();
  const [r, setR] = useState<Reminder>(value ?? { before: 0, unit: "Days", time: "09:00" });
  const info = (title: string, lines: string[]) =>
    sheets.open(
      <View>
        <DialogTitle>{t.t(title)}</DialogTitle>
        {lines.map((line) => (
          <Text key={line} style={{ color: "#666", marginBottom: 8, lineHeight: 21 }}>
            {t.t(line)}
          </Text>
        ))}
        <DialogActions>
          <TextButton label="OK" onPress={() => sheets.closeTop()} />
        </DialogActions>
      </View>,
      "dialog",
    );
  return (
    <View>
      <DialogTitle center>{t.t("Reminder")}</DialogTitle>
      <Stepper
        label="Before"
        text={String(r.before)}
        onStep={(k) => setR({ ...r, before: within(r.before + k, 0) })}
        onType={(v) => setR({ ...r, before: within(Number(v) || 0, 0) })}
        atMin={r.before <= 0}
        atMax={r.before >= MAX_INTERVAL}
      />
      <Dropdown
        text={unitName(r.unit, r.before)}
        onPress={() =>
          optionDialog<IntervalUnit>(
            "Choose time period",
            UNITS.map((u) => ({ value: u, label: u })),
            r.unit,
            (unit) => setR({ ...r, unit }),
          )
        }
      />
      <FieldTitle>At</FieldTitle>
      <Pressable accessibilityRole="button" onPress={() => openTime(r.time, (time) => setR({ ...r, time }))} style={{ height: 54, borderWidth: 1, borderColor: p.muted, borderRadius: 18, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: p.ink, fontSize: 19 }}>{timeLabel(r.time, t.locale)}</Text>
        <View style={{ position: "absolute", right: 16 }}>
          <Icon name="clock" size={24} color={p.ink} />
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={openReminderHelp} style={{ minHeight: 47, borderRadius: 28, borderWidth: 1, borderColor: "#8886", alignItems: "center", justifyContent: "center", marginTop: 18, paddingHorizontal: 12 }}>
        <Text style={{ color: p.ink, fontSize: 16, textAlign: "center" }}>{t.t("Important information about setting a reminder")}</Text>
      </Pressable>
      <Footer
        off={() => {
          close();
          onDone(null);
        }}
        ok={() => {
          if (r.before === 0 && r.unit !== "Days") return info("Error: Wrong date", ["The value 0 can only be used for days, not for months, weeks, or years!", "The value 0 days means the reminder will be set on the same day as the scheduled payment."]);
          if (comesAfterPayment(r, paymentTime)) return info("Error: Wrong time", [t.t("A reminder on the day of the payment has to come before the payment time ({time}).", { time: paymentTime ?? "" })]);
          close();
          onDone(r);
        }}
      />
    </View>
  );
}
export const openReminder = (value: Reminder | null, paymentTime: string | undefined, onDone: (r: Reminder | null) => void): number => sheets.open(<ReminderDialog value={value} paymentTime={paymentTime} onDone={onDone} />, "dialog");

// ---- Tags ----------------------------------------------------------------------------------------
function TagsSheet({ chosen: start, onDone }: { chosen: string[]; onDone: (tags: string[]) => void }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const run = useCommand();
  const [chosen, setChosen] = useState<string[]>(start);
  const toggle = (tag: string) => setChosen((c) => (c.includes(tag) ? c.filter((x) => x !== tag) : [...c, tag]));
  const add = () =>
    promptDialog(
      "New tag",
      "",
      (value) => {
        const name = value.trim();
        if (!name) return toast("Enter a tag");
        run((tx) => rememberTags(tx, [name]));
        setChosen((c) => (c.includes(name) ? c : [...c, name]));
      },
      "Tag name",
    );
  const menu = (tag: string) =>
    optionDialog<"edit" | "delete">("Tags", [{ value: "edit", label: "Edit" }, { value: "delete", label: "Delete" }], undefined, (what) => {
      if (what === "edit")
        promptDialog(
          "Rename tag",
          tag,
          (value) => {
            const name = value.trim();
            if (!name) return toast("Enter a tag");
            if (name !== tag && data.tags.includes(name)) return toast("Tag already exists");
            if (run((tx) => (renameTag(tx, tag, name), true))) setChosen((c) => c.map((x) => (x === tag ? name : x)));
          },
          "Name",
        );
      else
        confirmDialog(
          "Remove this tag from all operations?",
          () => {
            if (run((tx) => (deleteTag(tx, tag), true))) setChosen((c) => c.filter((x) => x !== tag));
          },
          true,
          "Delete",
        );
    });
  return (
    <View>
      <Text style={{ color: p.ink, fontSize: 22, fontWeight: "500", textAlign: "center", marginBottom: 14 }}>{t.t("Select tags")}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {data.tags.map((tag) => {
          const on = chosen.includes(tag);
          return (
            <Pressable key={tag} onPress={() => toggle(tag)} onLongPress={() => menu(tag)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: on ? p.accent : p.line, backgroundColor: on ? p.tint : "transparent" }}>
              <Text style={{ color: p.ink, fontSize: 15 }}>{tag}</Text>
            </Pressable>
          );
        })}
        <Pressable onPress={add} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: p.line }}>
          <Icon name="plus" size={14} color={p.ink} />
          <Text style={{ color: p.ink, fontSize: 15 }}>{t.t("Add")}</Text>
        </Pressable>
      </View>
      <View style={{ marginTop: 24 }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            close();
            onDone(chosen);
          }}
          style={{ alignItems: "center", paddingVertical: 16, borderRadius: 999, backgroundColor: p.accent }}
        >
          <Text style={{ color: p.onAccent, fontSize: 16, fontWeight: "600" }}>{t.t("Complete")}</Text>
        </Pressable>
      </View>
    </View>
  );
}
export const openTags = (chosen: string[], onDone: (tags: string[]) => void): number => sheets.open(<TagsSheet chosen={chosen} onDone={onDone} />);
