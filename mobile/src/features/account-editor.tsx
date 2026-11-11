// The account form (js/screens/accounts/edit.js, type.js, currency-change.js): for a new account the
// type is chosen first, then the fields; an existing account opens the form straight away, and its
// type is changed on a sheet. Icon and color are one "Icon" field; amounts open the calculator sheet;
// a currency change of an account with records asks how to treat them.
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import {
  accountDeletionImpact,
  accountDraft,
  changesCurrencyOfUsedAccount,
  checkedAccountDraft,
  deleteAccount,
  planCurrencyChange,
  setArchived,
  storeAccount,
  type AccountDraft,
  type CurrencyChangeMode,
} from "../domain/accounts.ts";
import { accountById } from "../domain/ledger.ts";
import { showError, useCommand, useLedger, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { openAmountSheet } from "../ui/amount-sheet.tsx";
import { openCurrencySheet } from "../ui/currency-sheet.tsx";
import { currencyName } from "../ui/currency-names.ts";
import { openCustomize } from "../ui/customize-sheet.tsx";
import { confirmDialog, DialogActions, DialogTitle, optionDialog, toast } from "../ui/dialogs.tsx";
import { FieldButton, FieldText, FieldToggle } from "../ui/form.tsx";
import { Button, Icon } from "../ui/kit.tsx";
import { ToneBadge } from "../ui/parts.tsx";
import { sheets, useCloseLayer } from "../ui/sheets.tsx";
import { mix, space } from "../ui/theme.ts";
import { TextButton } from "../ui/calendar-sheet.tsx";

export function HeaderAdd({ onPress }: { onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable onPress={onPress} hitSlop={12} style={{ paddingHorizontal: space.l }}>
      <Icon name="plus" color={p.accentInk} />
    </Pressable>
  );
}

const TYPES = [
  { type: "Regular", text: "Card, card or a bank account. For everyday income and expenses.", icon: "card", color: "#3f7ff0" },
  { type: "Savings", text: "Put money aside, with or without a goal — for a dream, a big purchase or a buffer for future events.", icon: "pig", color: "#25b57a" },
  { type: "Debt", text: "Money you borrowed or lent. Track who owes whom and how debt repayment is progressing.", icon: "document", color: "#f2812f" },
] as const;

function TypeChoices({ onPick }: { onPick: (type: AccountDraft["type"]) => void }) {
  const p = usePalette();
  const t = useT();
  return (
    <View style={{ gap: 14, paddingVertical: 4 }}>
      {TYPES.map((x) => (
        <Pressable key={x.type} accessibilityRole="button" onPress={() => onPick(x.type)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 16, minHeight: 96, padding: 16, borderWidth: 1, borderColor: p.line, borderRadius: 16, backgroundColor: pressed ? p.soft : p.key })}>
          <View style={{ width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: mix(x.color, p.bg, 0.15) }}>
            <Icon name={x.icon} size={28} color={x.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: p.ink, fontSize: 18, fontWeight: "600" }}>{t.t(x.type)}</Text>
            <Text style={{ color: p.inkSoft, fontSize: 15, lineHeight: 20, marginTop: 4 }}>{t.t(x.text)}</Text>
          </View>
          <Text style={{ color: p.muted, fontSize: 26 }}>›</Text>
        </Pressable>
      ))}
    </View>
  );
}

function TypeSheet({ onPick }: { onPick: (type: AccountDraft["type"]) => void }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  return (
    <View>
      <Text style={{ color: p.ink, fontSize: 22, fontWeight: "500", textAlign: "center", marginVertical: 8 }}>{t.t("Account type")}</Text>
      <TypeChoices
        onPick={(type) => {
          close();
          onPick(type);
        }}
      />
    </View>
  );
}

const DEBT_SWITCHES = [
  ["considerExpense", "Consider as expense", "Consider transfers to this account as expenses"],
  ["showExpense", "Show in expenses", "Show this account among expense categories"],
  ["considerIncome", "Consider as income", "Consider transfers from this account as incomes"],
  ["showIncome", "Show in income", "Show this account among income categories"],
] as const;

// How an account with records changes its currency: what each choice does to the balance.
function CurrencyChange({ id, currency, done }: { id: string; currency: string; done: (mode: CurrencyChangeMode) => void }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  const close = useCloseLayer();
  const [explain, setExplain] = useState(false);
  const a = accountById(data, id);
  if (!a) return null;
  const spent = planCurrencyChange(data, id, currency, "spent");
  const all = planCurrencyChange(data, id, currency, "all");
  const rows = [t.t("Balance: {before} → {after}", { before: money(spent.before, a.currency), after: money(spent.after, currency) })];
  if (spent.spentBefore !== spent.spentAfter)
    rows.push(t.t("{operations}: {before} → {after}", { operations: t.tc("{n} operation taken", "{n} operations taken", spent.taken), before: money(spent.spentBefore, a.currency), after: money(spent.spentAfter, currency) }));
  const pick = (mode: CurrencyChangeMode) => () => {
    close();
    done(mode);
  };
  const notes = [
    "Operations that took money from this account (expenses and transfers out) are recalculated at the rate above. The old amount stays under the operation as “was”.",
    "A transfer out also changes what the other account received, so that account’s balance changes too.",
    "Income, transfers in, balance corrections and the opening balance keep their numbers and only get the new currency. That is why the balance can differ from the old one.",
    "Category totals and statistics follow the new amounts.",
    "Changing the currency back recalculates the same operations again; the numbers return with small rounding differences.",
    "“Convert everything” converts every amount, so the balance is the old balance at the current rate.",
  ];
  return (
    <View style={{ gap: 10 }}>
      <DialogTitle>{t.t("Change account currency")}</DialogTitle>
      {rows.map((r) => (
        <Text key={r} style={{ color: p.ink, fontSize: 15 }}>
          • {r}
        </Text>
      ))}
      <Button label="Change currency" onPress={pick("spent")} />
      <Button label="Convert everything at the current rate" kind="outline" onPress={pick("all")} />
      <Text style={{ color: p.muted, fontSize: 13 }}>{t.t("Convert everything: balance {after}", { after: money(all.after, currency) })}</Text>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: explain }} onPress={() => setExplain(!explain)} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name="info" size={20} color={p.accentInk} />
        <Text style={{ color: p.accentInk, fontSize: 14 }}>{t.t("Important: how this works")}</Text>
      </Pressable>
      {explain ? notes.map((n) => <Text key={n} style={{ color: p.inkSoft, fontSize: 13, lineHeight: 19 }}>{t.t(n)}</Text>) : null}
      <DialogActions>
        <TextButton label="Cancel" onPress={close} />
      </DialogActions>
    </View>
  );
}

export function AccountEditor() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  const run = useCommand();
  const existing = id ? accountById(data, id) : undefined;
  const [draft, setDraft] = useState<AccountDraft>(() => accountDraft(data, existing));
  const [chosen, setChosen] = useState(!!existing);
  const set = (patch: Partial<AccountDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setType = (type: AccountDraft["type"]) => set({ type, debt: type === "Debt" && !draft.debt ? "Owe me" : draft.debt });
  const debt = draft.type === "Debt";
  const editing = !!existing;

  const save = () => {
    let checked: AccountDraft;
    try {
      checked = checkedAccountDraft(data, draft);
    } catch (error) {
      showError(t, error);
      return;
    }
    const store = (mode: CurrencyChangeMode) => {
      if (run((tx, env) => storeAccount(tx, checked, mode, env))) {
        toast("Account saved");
        router.back();
      }
    };
    if (!changesCurrencyOfUsedAccount(data, checked)) return store("spent");
    sheets.open(<CurrencyChange id={checked.id as string} currency={checked.currency} done={store} />, "dialog");
  };

  // Deleting an account deletes its operations and transfers, and other accounts' balances follow.
  const remove = () => {
    if (!existing) return;
    const impact = accountDeletionImpact(data, existing.id);
    const others = [...impact.otherBalances.entries()]
      .map(([other, change]) => {
        const a = accountById(data, other);
        return a ? `• ${a.name}: ${change > 0 ? "+" : ""}${money(change, a.currency)}` : "";
      })
      .filter(Boolean)
      .join("\n");
    const message = [
      t.t("Operations that will be deleted: {n}. Scheduled payments: {s}.", { n: impact.operations, s: impact.scheduled }),
      others ? `${t.t("Balances of other accounts will change:")}\n${others}` : "",
      t.t("This cannot be undone. Save a data file first if you may need this data."),
    ]
      .filter(Boolean)
      .join("\n\n");
    confirmDialog(
      "Delete this account and all linked operations?",
      () => {
        if (run((tx) => deleteAccount(tx, existing.id))) router.back();
      },
      true,
      "Delete",
      message,
    );
  };

  const amount = (label: string, value: number, onChange: (v: number) => void, signed = false, shownAs = label) => <FieldButton inline tone={value < 0 ? "negative" : "positive"} label={shownAs} value={money(value, draft.currency)} onPress={() => openAmountSheet(label, value, onChange, signed, draft.currency)} />;
  const counterpart = accountById(data, draft.counterpart ?? "");
  const regulars = data.accounts.filter((a) => !a.archived && a.id !== draft.id);

  if (!chosen)
    return (
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        <Stack.Screen options={{ title: t.t("New account") }} />
        <ScrollView contentContainerStyle={{ padding: space.l }}>
          <TypeChoices
            onPick={(type) => {
              setType(type);
              setChosen(true);
            }}
          />
        </ScrollView>
      </View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Stack.Screen options={{ title: t.t(editing ? "Change account" : "New account") }} />
      <ScrollView contentContainerStyle={{ padding: space.l, gap: 24 }} keyboardShouldPersistTaps="handled">
        <FieldText boxed label="Title" value={draft.name} onChange={(name) => set({ name })} placeholder="Enter the title" />
        <FieldButton inline label="Icon" onPress={() => openCustomize({ icon: draft.icon, color: draft.color }, (look) => set(look))} right={<ToneBadge icon={draft.icon} color={draft.color} size={40} iconSize={22} />} />
        <FieldText label="Description" value={draft.description ?? ""} onChange={(description) => set({ description })} />
        <FieldButton
          label="Account type"
          onPress={() => sheets.open(<TypeSheet onPick={setType} />, "sheet")}
          right={
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <View style={{ width: 28, height: 28, borderRadius: 7, alignItems: "center", justifyContent: "center", backgroundColor: p.accent }}>
                <Icon name={TYPES.find((x) => x.type === draft.type)?.icon ?? "wallet"} size={18} color={p.onAccent} />
              </View>
              <Text style={{ color: p.accentInk, fontSize: 15 }}>{t.t(draft.type)}</Text>
            </View>
          }
        />
        {debt ? <FieldButton label="Type of debt" value={t.t(draft.debt ?? "Owe me")} onPress={() => optionDialog<"Owe me" | "I owe">("Type of debt", [{ value: "Owe me", label: "Owe me" }, { value: "I owe", label: "I owe" }], draft.debt ?? "Owe me", (v) => set({ debt: v }))} /> : null}
        <FieldButton label="Account currency" value={currencyName(draft.currency, t.locale)} onPress={() => openCurrencySheet(draft.currency, (currency) => set({ currency }))} />
        {amount(debt ? "Amount of debt" : "Current balance", debt ? Math.abs(draft.balance) : draft.balance, (balance) => set({ balance }), !debt, debt && editing ? "Current debt" : undefined)}
        {debt && editing ? amount("Total debt", draft.totalDebt ?? Math.abs(draft.balance), (v) => set({ totalDebt: Math.abs(v) })) : null}
        {draft.type === "Regular" ? amount("Credit limit", draft.limit, (limit) => set({ limit })) : null}
        {draft.type === "Savings" ? amount("Goal", draft.goal, (goal) => set({ goal })) : null}
        {debt && !editing ? <FieldToggle label="Create operation" hint="Create an operation about receiving or sending the amount of this debt" value={draft.createOperation} onChange={(createOperation) => set({ createOperation })} /> : null}
        {debt && !editing && draft.createOperation ? (
          <FieldButton
            label="Account"
            value={counterpart?.name ?? t.t("Not selected")}
            onPress={() =>
              optionDialog<string>(
                "Select account",
                regulars.map((a) => ({ value: a.id, label: a.name })),
                draft.counterpart ?? undefined,
                (v) => set({ counterpart: v }),
              )
            }
          />
        ) : null}
        <FieldToggle label="Include in overall balance" hint="Include the account value in the total at the top of the application" value={draft.include} onChange={(include) => set({ include })} />
        {debt ? DEBT_SWITCHES.map(([key, label, hint]) => <FieldToggle key={key} label={label} hint={hint} value={!!draft[key]} onChange={(v) => set({ [key]: v })} />) : null}
        <View style={{ gap: 10, paddingTop: 6 }}>
          <Button label={editing ? "Save" : "Create"} onPress={save} />
          {existing ? (
            <>
              <Button label={existing.archived ? "Return from archive" : "Move to archive"} kind="outline" onPress={() => run((tx) => (setArchived(tx, existing.id, !existing.archived), true)) && router.back()} />
              <Button label="Delete" kind="danger" onPress={remove} />
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
