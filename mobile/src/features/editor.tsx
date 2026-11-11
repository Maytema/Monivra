// The operation editor: a calculator for the amount, the two sides, a second amount when currencies
// differ, the day, a repeat, a comment and tags. Saving goes through the domain rules
// (domain/operations.ts): a non-financial edit never changes an amount.
import { useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { addDays } from "../domain/dates.ts";
import { accountById, categoryById, defaultAccountId } from "../domain/ledger.ts";
import { convert, evaluateExpression, netAmount, typeKey } from "../domain/money.ts";
import { deleteOperations, isFarDate, putOperation, rememberTags } from "../domain/operations.ts";
import type { IntervalUnit, Operation, ScheduledPayment } from "../domain/types.ts";
import { useCommand, useLedger, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { Badge, Button, ChoiceField, Field, Label, Screen, Segmented, Toggle } from "../ui/kit.tsx";
import { AccountPicker, CategoryPicker, OptionPicker } from "../ui/pickers.tsx";
import { font, radius, space } from "../ui/theme.ts";
import { appStore } from "../ui/app-context.tsx";

const KEYS = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", ".", "0", "⌫", "+"];
const TYPES = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
] as const;
const REPEATS: { value: string; label: string }[] = [
  { value: "none", label: "Does not repeat" },
  { value: "Days", label: "Every day" },
  { value: "Weeks", label: "Every week" },
  { value: "Months", label: "Every month" },
  { value: "Years", label: "Every year" },
];

type Params = { id?: string; scheduled?: string; type?: string; category?: string; from?: string; to?: string };

export function OperationEditor() {
  const params = useLocalSearchParams<Params>();
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  const run = useCommand();
  const env = appStore().env;
  const schedule = params.scheduled === "1";
  const original = useMemo<Operation | ScheduledPayment | undefined>(
    () => (params.id ? (schedule ? data.scheduled : data.ops).find((o) => o.id === params.id) : undefined),
    // The original is read once, when the editor opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [draft, setDraft] = useState<Operation & Partial<ScheduledPayment>>(() => {
    if (original) return { ...original, tags: [...original.tags] };
    const category = params.category ? categoryById(data, params.category) : undefined;
    const type = (category?.type ?? params.type ?? "expense") as Operation["type"];
    const account = params.from ?? params.to ?? defaultAccountId(data);
    return {
      id: "",
      type,
      amount: 0,
      date: env.clock.today(),
      comment: "",
      tags: [],
      category: category?.id,
      from: type === "income" ? null : account,
      to: type === "income" ? account : type === "transfer" ? (params.to ?? null) : null,
    };
  });
  const [expr, setExpr] = useState(original ? String(original.amount / 100) : "0");
  const [fresh, setFresh] = useState(!original);
  const [second, setSecond] = useState<string | null>(null);
  const [picking, setPicking] = useState<"from" | "to" | "category" | "repeat" | null>(null);
  const [tagText, setTagText] = useState("");
  const set = (patch: Partial<Operation & ScheduledPayment>) => setDraft((d) => ({ ...d, ...patch }));

  let amount = 0;
  let amountError: string | null = null;
  try {
    amount = evaluateExpression(expr);
  } catch (error) {
    amountError = error instanceof Error ? error.message : "Enter a valid amount";
  }
  const account = accountById(data, draft.type === "income" ? draft.to : draft.from);
  const target = draft.type === "transfer" ? accountById(data, draft.to) : undefined;
  const category = categoryById(data, draft.category);
  const secondCurrency = draft.type === "transfer" ? target?.currency : category?.currency;
  const crossCurrency = !!account && !!secondCurrency && secondCurrency !== account.currency && draft.type !== "adjustment";
  const sameAsOriginal = !!original && original.amount === amount && JSON.stringify(original.fees ?? []) === JSON.stringify(draft.fees ?? []) && original.from === draft.from && original.to === draft.to && original.category === draft.category;
  const storedSecond = draft.type === "transfer" ? original?.receive : original?.categoryAmount?.amount;
  const convertedSecond = crossCurrency ? convert(draft.type === "transfer" ? netAmount({ amount, fees: draft.fees }) : amount, account?.currency, secondCurrency, data.rates) : 0;
  let typedSecond: number | null = null;
  try {
    typedSecond = second !== null && second.trim() ? Math.abs(evaluateExpression(second)) : null;
  } catch {
    typedSecond = null;
  }
  const shownSecond = typedSecond ?? (sameAsOriginal && storedSecond !== undefined ? storedSecond : convertedSecond);

  const press = (key: string) => {
    if (key === "=") {
      try {
        setExpr(typeKey(expr, "="));
      } catch {
        // The expression stays as typed; the amount line says what is wrong.
      }
    } else setExpr(typeKey(expr, key, fresh && /[0-9.]/.test(key)));
    setFresh(false);
  };

  const changeType = (type: Operation["type"]) => {
    const accountId = draft.from ?? draft.to ?? defaultAccountId(data);
    set({
      type,
      category: type === "transfer" ? undefined : category?.type === type ? draft.category : undefined,
      from: type === "income" ? null : accountId,
      to: type === "income" ? accountId : type === "transfer" ? null : null,
    });
    setSecond(null);
  };

  const save = () => {
    const tags = [...new Set([...draft.tags, ...tagText.split(",").map((s) => s.trim()).filter(Boolean)])];
    const op: Operation & Partial<ScheduledPayment> = { ...draft, amount, tags };
    if (crossCurrency && typedSecond !== null) {
      op.receive = typedSecond;
      op.receiveManual = true;
    } else delete op.receiveManual;
    const store = () => {
      const result = run((tx, e) => {
        rememberTags(tx, tags);
        return putOperation(tx, op, e, schedule || !!op.recur);
      });
      if (!result) return;
      if (result.planned) Alert.alert(t.t("Saved as a scheduled payment"), t.t("An operation dated in the future waits among the scheduled payments until its day."));
      router.back();
    };
    if (isFarDate(op.date, env.clock.today()))
      Alert.alert(t.t("Is the date right?"), t.day(op.date), [
        { text: t.t("Cancel"), style: "cancel" },
        { text: t.t("Save"), onPress: store },
      ]);
    else store();
  };

  const remove = () =>
    Alert.alert(t.t("Delete this operation?"), undefined, [
      { text: t.t("Cancel"), style: "cancel" },
      { text: t.t("Delete"), style: "destructive", onPress: () => run((tx) => (deleteOperations(tx, [draft.id], schedule), true)) && router.back() },
    ]);

  const repeatValue = draft.recur ? draft.recur.unit : "none";
  return (
    <Screen>
      <Stack.Screen options={{ title: t.t(original ? (schedule ? "Scheduled payment" : "Change operation") : "New operation") }} />
      {draft.type === "adjustment" ? <Label>{t.t("Manual balance adjustment")}</Label> : <Segmented value={draft.type as "expense"} options={TYPES} onChange={changeType} />}
      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <Text style={{ color: p.muted, fontSize: font.small }}>{expr}</Text>
        <Text style={{ color: p.ink, fontSize: font.hero, fontWeight: "700" }}>{money(amount, account?.currency)}</Text>
        {amountError ? <Text style={{ color: p.negativeInk }}>{t.t(amountError)}</Text> : null}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {[...KEYS, "C", "="].map((k) => (
          <Pressable key={k} onPress={() => (k === "C" ? setExpr("0") : press(k))} style={({ pressed }) => ({ width: "23.5%", paddingVertical: 12, borderRadius: radius.m, backgroundColor: pressed ? p.soft : "=+−×÷".includes(k) ? p.tint : p.key, alignItems: "center" })}>
            <Text style={{ color: p.ink, fontSize: 20 }}>{k}</Text>
          </Pressable>
        ))}
      </View>
      <ChoiceField
        label={draft.type === "income" ? "To account" : draft.type === "transfer" ? "From account" : "Account"}
        value={account?.name ?? t.t("Not selected")}
        left={account ? <Badge icon={account.icon} color={account.color} size={30} /> : undefined}
        onPress={() => setPicking(draft.type === "income" ? "to" : "from")}
      />
      {draft.type === "transfer" ? (
        <ChoiceField label="To account" value={target?.name ?? t.t("Not selected")} left={target ? <Badge icon={target.icon} color={target.color} size={30} /> : undefined} onPress={() => setPicking("to")} />
      ) : draft.type !== "adjustment" ? (
        <ChoiceField label="Category" value={category?.name ?? t.t("Not selected")} left={category ? <Badge icon={category.icon} color={category.color} size={30} /> : undefined} onPress={() => setPicking("category")} />
      ) : null}
      {crossCurrency ? (
        <Field
          label={`${t.t(draft.type === "transfer" ? "Received" : "Amount in the category's currency")} (${secondCurrency})`}
          value={second ?? String(shownSecond / 100)}
          onChange={setSecond}
          keyboard="decimal-pad"
        />
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.s }}>
        <Button label="‹" kind="outline" onPress={() => set({ date: addDays(draft.date, -1) })} />
        <Pressable style={{ flex: 1, alignItems: "center" }} onPress={() => set({ date: env.clock.today() })}>
          <Text style={{ color: p.ink, fontSize: font.body, fontWeight: "600" }}>{t.day(draft.date)}</Text>
          <Label>{draft.date === env.clock.today() ? t.t("Today") : t.t("Tap for today")}</Label>
        </Pressable>
        <Button label="›" kind="outline" onPress={() => set({ date: addDays(draft.date, 1) })} />
      </View>
      {draft.date > env.clock.today() && !schedule ? <Label>{t.t("A date in the future makes it a scheduled payment.")}</Label> : null}
      {draft.type !== "adjustment" ? <ChoiceField label="Repeat" value={t.t(REPEATS.find((r) => r.value === repeatValue)?.label ?? "")} onPress={() => setPicking("repeat")} /> : null}
      {schedule || draft.recur || draft.date > env.clock.today() ? (
        <Toggle
          label="Remind on the day of the payment"
          value={!!draft.reminder}
          onChange={(on) => set({ reminder: on ? { before: 0, unit: "Days", time: draft.time && draft.time > "09:00" ? "09:00" : "08:00" } : null })}
          hint={draft.reminder ? `${t.t("At")} ${draft.reminder.time}` : undefined}
        />
      ) : null}
      <Field label="Comment" value={draft.comment} onChange={(comment) => set({ comment })} />
      <Field label="Tags" value={tagText} onChange={setTagText} placeholder="Separated by commas" />
      {data.tags.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {data.tags.map((tag) => {
            const on = draft.tags.includes(tag);
            return (
              <Pressable key={tag} onPress={() => set({ tags: on ? draft.tags.filter((x) => x !== tag) : [...draft.tags, tag] })} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: on ? p.accent : p.nav }}>
                <Text style={{ color: on ? p.onAccent : p.ink }}>{tag}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <Button label="Save" onPress={save} disabled={!!amountError || amount <= 0} />
      {original ? <Button label="Delete" kind="danger" onPress={remove} /> : null}
      <AccountPicker
        visible={picking === "from" || picking === "to"}
        exclude={picking === "to" && draft.type === "transfer" ? draft.from : picking === "from" && draft.type === "transfer" ? draft.to : null}
        onPick={(a) => (picking === "to" ? set({ to: a.id }) : set({ from: a.id }), setSecond(null))}
        onClose={() => setPicking(null)}
      />
      <CategoryPicker visible={picking === "category"} type={draft.type === "income" ? "income" : "expense"} onPick={(c) => (set({ category: c.id }), setSecond(null))} onClose={() => setPicking(null)} />
      <OptionPicker
        visible={picking === "repeat"}
        title="Repeat"
        options={REPEATS}
        value={repeatValue}
        onPick={(unit) => set({ recur: unit === "none" ? null : { every: 1, unit: unit as IntervalUnit, days: [], remaining: null }, reminder: draft.reminder ?? null })}
        onClose={() => setPicking(null)}
      />
    </Screen>
  );
}
