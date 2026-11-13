// The dialogs behind the editor's "Additionally" sheet (js/screens/{fees,recurrence}.js and
// operation-editor/{keypad,extras}.js): tax and commission, how a payment repeats, its reminder, the
// time of a payment, tags. Each one edits a copy and gives it back when OK is pressed.
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Pressable } from "../../ui/pressable.tsx";
import { feeOfKind, withFee } from "../../domain/money.ts";
import { comesAfterPayment, reminderForTime } from "../../domain/scheduled.ts";
import type { Fee, IntervalUnit, Recurrence, Reminder } from "../../domain/types.ts";
import { useLedger, usePalette, useT } from "../../ui/app-context.tsx";
import { PrimaryPill, TextButton } from "../../ui/calendar-sheet.tsx";
import { DialogActions, DialogTitle, optionDialog, promptDialog, confirmDialog, toast } from "../../ui/dialogs.tsx";
import { Icon } from "../../ui/kit.tsx";
import { useCommand } from "../../ui/app-context.tsx";
import { openTime } from "../../ui/time-dialog.tsx";
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
  return <Text style={{ color: p.inkSoft, fontSize: 14, marginTop: 14, marginBottom: 6 }}>{t.t(children)}</Text>;
}

function Stepper({ label, text, onStep, onType, atMin, atMax }: { label: string; text: string; onStep: (k: number) => void; onType: (value: string) => void; atMin: boolean; atMax: boolean }) {
  const p = usePalette();
  const round = (disabled: boolean) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: p.soft, opacity: disabled ? 0.4 : 1 });
  return (
    <View>
      <FieldTitle>{label}</FieldTitle>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable accessibilityLabel="−" disabled={atMin} onPress={() => onStep(-1)} style={round(atMin)}>
          <Icon name="minus" size={20} color={p.accentInk} />
        </Pressable>
        <TextInput
          value={text}
          onChangeText={onType}
          keyboardType="number-pad"
          maxLength={4}
          style={{ flex: 1, textAlign: "center", color: p.ink, fontSize: 20, borderWidth: 1, borderColor: p.muted, borderRadius: 14, paddingVertical: 8 }}
        />
        <Pressable accessibilityLabel="+" disabled={atMax} onPress={() => onStep(1)} style={round(atMax)}>
          <Icon name="plus" size={20} color={p.accentInk} />
        </Pressable>
      </View>
    </View>
  );
}

function Dropdown({ text, onPress }: { text: string; onPress: () => void }) {
  const p = usePalette();
  const t = useT();
  return (
    <Pressable onPress={onPress} style={{ marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: p.muted, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13 }}>
      <Text style={{ color: p.ink, fontSize: 16 }}>{t.t(text)}</Text>
      <Icon name="down" size={18} color={p.muted} />
    </Pressable>
  );
}

function FieldButton({ label, text, onPress }: { label: string; text: string; onPress: () => void }) {
  const p = usePalette();
  const t = useT();
  return (
    <Pressable onPress={onPress} style={{ marginTop: 12, borderWidth: 1, borderColor: p.muted, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 9 }}>
      <Text style={{ color: p.muted, fontSize: 12 }}>{t.t(label)}</Text>
      <Text style={{ color: p.ink, fontSize: 16 }}>{text}</Text>
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
        <Pressable onPress={off} accessibilityRole="button" style={{ marginTop: 18, alignItems: "center", paddingVertical: 12, borderRadius: 999, borderWidth: 1, borderColor: p.accent }}>
          <Text style={{ color: p.accentInk, fontSize: 15, fontWeight: "500" }}>{t.t(offLabel)}</Text>
        </Pressable>
      ) : null}
      <DialogActions>
        <TextButton label="Cancel" onPress={close} />
        <PrimaryPill label="OK" onPress={ok} />
      </DialogActions>
    </View>
  );
}

// ---- Time ----------------------------------------------------------------------------------------


// A payment's time; a reminder of the same day that would come after it moves along or is dropped.
export function setPaymentTime(session: EditorSession, time: string): void {
  const kept = reminderForTime(session.draft.reminder ?? null, session.draft.time, time);
  if (kept !== (session.draft.reminder ?? null)) toast(kept ? `Reminder moved to ${kept.time}` : "Reminder turned off: there is no time left before the payment");
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
      <DialogTitle>{t.t("Recur")}</DialogTitle>
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
      <DialogTitle>{t.t("Reminder")}</DialogTitle>
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
      <FieldButton label="At" text={r.time} onPress={() => openTime(r.time, (time) => setR({ ...r, time }))} />
      <Pressable accessibilityRole="button" onPress={openReminderHelp} style={{ minHeight: 47, borderRadius: 28, borderWidth: 1, borderColor: "#8886", alignItems: "center", justifyContent: "center", marginVertical: 12, paddingHorizontal: 12 }}>
        <Text style={{ fontSize: 15, textAlign: "center" }}>{t.t("Important information about setting a reminder")}</Text>
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
