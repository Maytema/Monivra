// Accounts: the tab with the total and the groups, and the account editor.
import { useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import {
  accountDeletionImpact,
  accountDraft,
  changesCurrencyOfUsedAccount,
  checkedAccountDraft,
  deleteAccount,
  setArchived,
  storeAccount,
  type AccountDraft,
  type CurrencyChangeMode,
} from "../domain/accounts.ts";
import { accountBalance, accountById, cardState, overallBalance, progressForBalance } from "../domain/ledger.ts";
import { evaluateExpression } from "../domain/money.ts";
import type { Account } from "../domain/types.ts";
import { showError, useCommand, useLedger, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { Badge, Button, Card, ChoiceField, Field, Icon, Label, Money, Row, Screen, Segmented, Toggle } from "../ui/kit.tsx";
import { OptionPicker } from "../ui/pickers.tsx";
import { font, space } from "../ui/theme.ts";
import { AddButton } from "./add-button.tsx";

const GROUPS = [
  ["Accounts", (a: Account) => a.type === "Regular"],
  ["Savings", (a: Account) => a.type === "Savings"],
  ["Debts", (a: Account) => a.type === "Debt"],
] as const;

export function AccountsScreen() {
  const data = useLedger();
  const money = useMoney();
  const p = usePalette();
  const t = useT();
  const [showArchived, setShowArchived] = useState(false);
  const total = overallBalance(data);
  const archived = data.accounts.filter((a) => a.archived);
  const subtitle = (a: Account): string | undefined => {
    const balance = accountBalance(data, a.id);
    const card = cardState(a, balance);
    if (card) return `${t.t("Available")}: ${money(card.available, a.currency, true)}`;
    const progress = progressForBalance(a, balance);
    if (progress?.kind === "goal") return progress.left > 0 ? `${t.t("To goal")}: ${money(progress.left, a.currency, true)}` : t.t("Goal reached");
    if (a.type === "Debt") return t.t(balance < 0 ? "I owe" : balance > 0 ? "Owe me" : "Settled");
    return a.description || undefined;
  };
  const list = (accounts: Account[]) =>
    accounts.map((a) => {
      const balance = accountBalance(data, a.id);
      return (
        <Row
          key={a.id}
          left={<Badge icon={a.icon} color={a.color} />}
          title={(a.favorite ? "★ " : "") + a.name}
          subtitle={subtitle(a)}
          right={<Money value={balance} text={money(balance, a.currency, true)} />}
          onPress={() => router.push({ pathname: "/account", params: { id: a.id } })}
        />
      );
    });
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ headerRight: () => <HeaderAdd onPress={() => router.push("/account")} /> }} />
      <Screen>
        <Card>
          <Label>{t.t("Balance")}</Label>
          <Text style={{ color: p.ink, fontSize: font.hero, fontWeight: "700" }}>{money(total, data.settings.currency, true)}</Text>
        </Card>
        {GROUPS.map(([title, match]) => {
          const accounts = data.accounts.filter((a) => !a.archived && match(a));
          if (!accounts.length) return null;
          return (
            <View key={title} style={{ gap: space.xs }}>
              <Label>{t.t(title)}</Label>
              <Card style={{ paddingHorizontal: space.s, paddingVertical: space.s }}>{list(accounts)}</Card>
            </View>
          );
        })}
        {!data.accounts.length ? <Button label="Create account" onPress={() => router.push("/account")} /> : null}
        {archived.length ? (
          <Pressable onPress={() => setShowArchived(!showArchived)}>
            <Label>{`${t.t("Archive")} (${archived.length}) ${showArchived ? "▴" : "▾"}`}</Label>
          </Pressable>
        ) : null}
        {showArchived ? <Card style={{ paddingHorizontal: space.s }}>{list(archived)}</Card> : null}
      </Screen>
      <AddButton />
    </View>
  );
}

export function HeaderAdd({ onPress }: { onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable onPress={onPress} hitSlop={12} style={{ paddingHorizontal: space.l }}>
      <Icon name="plus" color={p.accentInk} />
    </Pressable>
  );
}

// An amount typed as text (digits, a decimal comma or point, and + − × ÷).
export function AmountField({ label, value, onChange, signed = false }: { label: string; value: number; onChange: (v: number) => void; signed?: boolean }) {
  const [text, setText] = useState(value ? String(value / 100) : "");
  return (
    <Field
      label={label}
      value={text}
      keyboard={signed ? "numeric" : "decimal-pad"}
      onChange={(v) => {
        setText(v);
        try {
          const n = v.trim() ? evaluateExpression(v) : 0;
          onChange(signed ? n : Math.abs(n));
        } catch {
          // Shown as typed; the value is taken once it reads as a number.
        }
      }}
    />
  );
}

const TYPES = [
  { value: "Regular", label: "Regular" },
  { value: "Savings", label: "Savings" },
  { value: "Debt", label: "Debt" },
] as const;

export function AccountEditor() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const data = useLedger();
  const t = useT();
  const money = useMoney();
  const run = useCommand();
  const existing = id ? accountById(data, id) : undefined;
  const [draft, setDraft] = useState<AccountDraft>(() => accountDraft(data, existing));
  const [picking, setPicking] = useState<"currency" | "debt" | null>(null);
  const set = (patch: Partial<AccountDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const currencies = useMemo(() => Object.keys(data.rates).sort().map((c) => ({ value: c, label: c })), [data.rates]);

  const save = () => {
    let checked: AccountDraft;
    try {
      checked = checkedAccountDraft(data, draft);
    } catch (error) {
      showError(t, error);
      return;
    }
    const store = (mode: CurrencyChangeMode) => {
      if (run((tx, env) => storeAccount(tx, checked, mode, env))) router.back();
    };
    if (!changesCurrencyOfUsedAccount(data, checked)) return store("spent");
    Alert.alert(t.t("Change the currency of the account?"), t.t("Choose what happens to the operations of this account."), [
      { text: t.t("Cancel"), style: "cancel" },
      { text: t.t("Recalculate what was spent"), onPress: () => store("spent") },
      { text: t.t("Convert everything"), onPress: () => store("all") },
    ]);
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
    Alert.alert(t.t("Delete this account and all linked operations?"), message, [
      { text: t.t("Cancel"), style: "cancel" },
      {
        text: t.t("Delete"),
        style: "destructive",
        onPress: () => {
          if (run((tx) => deleteAccount(tx, existing.id))) router.back();
        },
      },
    ]);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t.t(existing ? "Change account" : "New account") }} />
      <Field label="Title" value={draft.name} onChange={(name) => set({ name })} placeholder="Enter a name" />
      <Segmented value={draft.type} options={TYPES} onChange={(type) => set({ type })} />
      <ChoiceField label="Account currency" value={draft.currency} onPress={() => setPicking("currency")} />
      {draft.type === "Debt" ? <ChoiceField label="Type of debt" value={t.t(draft.debt)} onPress={() => setPicking("debt")} /> : null}
      <AmountField label={draft.type === "Debt" ? "Amount of debt" : "Current balance"} value={draft.type === "Debt" ? Math.abs(draft.balance) : draft.balance} onChange={(balance) => set({ balance })} signed={draft.type !== "Debt"} />
      {draft.type === "Regular" ? <AmountField label="Credit limit" value={draft.limit} onChange={(limit) => set({ limit })} /> : null}
      {draft.type === "Savings" ? <AmountField label="Goal" value={draft.goal} onChange={(goal) => set({ goal })} /> : null}
      {draft.type === "Debt" && existing ? <AmountField label="Total debt" value={draft.totalDebt ?? 0} onChange={(totalDebt) => set({ totalDebt })} /> : null}
      <Field label="Description" value={draft.description} onChange={(description) => set({ description })} />
      <Toggle label="Include in overall balance" value={draft.include} onChange={(include) => set({ include })} />
      <Toggle label="Favorite" value={draft.favorite} onChange={(favorite) => set({ favorite })} hint="Used by default in new operations" />
      {draft.type === "Debt" ? (
        <>
          <Toggle label="Consider as expense" value={draft.considerExpense} onChange={(considerExpense) => set({ considerExpense })} hint="Consider transfers to this account as expenses" />
          <Toggle label="Consider as income" value={draft.considerIncome} onChange={(considerIncome) => set({ considerIncome })} hint="Consider transfers from this account as incomes" />
        </>
      ) : null}
      <Button label={existing ? "Save" : "Create"} onPress={save} />
      {existing ? (
        <>
          <Button label={existing.archived ? "Return from archive" : "Move to archive"} kind="outline" onPress={() => run((tx) => (setArchived(tx, existing.id, !existing.archived), true)) && router.back()} />
          <Button label="Delete" kind="danger" onPress={remove} />
        </>
      ) : null}
      <OptionPicker visible={picking === "currency"} title="Account currency" options={currencies} value={draft.currency} onPick={(currency) => set({ currency })} onClose={() => setPicking(null)} />
      <OptionPicker
        visible={picking === "debt"}
        title="Type of debt"
        options={[
          { value: "Owe me", label: "Owe me" },
          { value: "I owe", label: "I owe" },
        ]}
        value={draft.debt}
        onPick={(debt) => set({ debt })}
        onClose={() => setPicking(null)}
      />
    </Screen>
  );
}
