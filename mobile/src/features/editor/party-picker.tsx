// The sheet behind a tile of the editor (js/screens/operation-editor/parties.js `counterpartyPicker`,
// `transferDestinationPicker`): categories and accounts as tiles, on two tabs. Choosing puts the item
// on that side of the operation and closes the sheet.
import { useState } from "react";
import { Text, View } from "react-native";
import { Pressable } from "../../ui/pressable.tsx";
import { accountBalance, categoryById } from "../../domain/ledger.ts";
import type { Account, Category, LedgerData } from "../../domain/types.ts";
import { useLedger, useMoney, usePalette, useT } from "../../ui/app-context.tsx";
import { MoneyText, ToneBadge, TopTabs } from "../../ui/parts.tsx";
import { Icon } from "../../ui/kit.tsx";
import { convert } from "../../domain/money.ts";
import { sheets, useCloseLayer } from "../../ui/sheets.tsx";
import type { EditorSession } from "./session.ts";

type Tab = "category" | "account";

export function Tile({ icon, color, name, figure, onPress }: { icon: string; color: string; name: string; figure: string; onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ width: "48.5%", minHeight: 68, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9, paddingHorizontal: 6, borderWidth: 1, borderColor: p.line, borderRadius: 17, backgroundColor: pressed ? p.soft : p.key })}
    >
      <ToneBadge icon={icon} color={color} size={45} iconSize={24} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: p.ink, fontSize: 15 }}>
          {name}
        </Text>
        <Text numberOfLines={1} style={{ color: p.ink, opacity: 0.6, fontSize: 13, marginTop: 5 }}>
          {figure}
        </Text>
      </View>
    </Pressable>
  );
}

// Account cards grouped by kind, each group with its total in the main currency (js/screens/pickers.js
// `accountCardsHtml`): one list design wherever an account is asked for.
const ACCOUNT_GROUPS: readonly [string, (a: Account) => boolean][] = [
  ["Accounts", (a) => a.type === "Regular"],
  ["Savings", (a) => a.type === "Savings"],
  ["Debts", (a) => a.type === "Debt"],
];
export function AccountCards({ accounts, chosen, onPick }: { accounts: readonly Account[]; chosen?: string | null; onPick: (id: string) => void }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  if (!accounts.length) return <Text style={{ color: p.muted, fontSize: 13, paddingVertical: 18, textAlign: "center" }}>{t.t("No available accounts")}</Text>;
  return (
    <View style={{ paddingBottom: 24 }}>
      {ACCOUNT_GROUPS.map(([label, belongs], index) => {
        const rows = accounts.filter(belongs);
        if (!rows.length) return null;
        const total = rows.reduce((n, a) => n + convert(accountBalance(data, a.id), a.currency, data.settings.currency, data.rates), 0);
        return (
          <View key={label}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12, paddingTop: index ? 22 : 6, paddingBottom: 10, paddingHorizontal: 6 }}>
              <Text style={{ color: p.inkSoft, fontSize: 15, fontWeight: "500" }}>{t.t(label)}</Text>
              <MoneyText text={money(total, data.settings.currency, true)} value={total} size={15} />
            </View>
            {rows.map((a) => {
              const balance = accountBalance(data, a.id);
              return (
                <Pressable key={a.id} accessibilityRole="button" accessibilityLabel={a.name} onPress={() => onPick(a.id)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, marginBottom: 12, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: p.line, backgroundColor: pressed ? p.soft : p.key })}>
                  <ToneBadge icon={a.icon} color={a.color} size={46} iconSize={26} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: p.ink, fontSize: 17 }}>{a.name}</Text>
                    <MoneyText text={money(balance, a.currency, true)} value={balance} size={17} />
                  </View>
                  {chosen === a.id ? <Icon name="check" size={18} color={p.accentInk} /> : null}
                </Pressable>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

export const sum = (data: LedgerData, category: Category): number => data.ops.filter((o) => o.category === category.id || categoryById(data, o.category)?.parent === category.id).reduce((n, o) => n + o.amount, 0);

// `toAccount`: the destination of a transfer (accounts only). `onChosen` runs after the choice (the
// editor opens then when the picker came first, from an account's actions).
function Picker({ session, incoming, accountsOnly, toAccount = false, title, onChosen }: { session: EditorSession; incoming: boolean; accountsOnly: boolean; toAccount?: boolean; title: string; onChosen?: () => void }) {
  const data = useLedger();
  const t = useT();
  const p = usePalette();
  const money = useMoney();
  const close = useCloseLayer();
  const type = incoming ? "income" : "expense";
  const [tab, setTab] = useState<Tab>(accountsOnly || session.draft.type !== type ? "account" : "category");
  // A transfer cannot go to the account it comes from.
  const other = incoming ? session.draft.to : session.draft.from;
  const accounts: Account[] = data.accounts.filter((a) => !a.archived && (accountsOnly || a.id !== other));
  const categories: Category[] = data.categories.filter((c) => !c.archived && !c.parent && c.type === type);
  const pickAccount = (id: string) => {
    close();
    if (toAccount) session.makeTransferTo(id);
    else if (accountsOnly) session.replaceOwnAccount(id);
    else session.putAccount(incoming, id);
    onChosen?.();
  };
  const pickCategory = (id: string) => {
    close();
    session.putCategory(incoming, id);
    onChosen?.();
  };
  const list = toAccount ? data.accounts.filter((a) => !a.archived && a.id !== session.draft.from) : accounts;
  return (
    <View>
      <Text style={{ color: p.ink, fontSize: 25, fontWeight: "500", textAlign: "center", marginTop: 6, marginBottom: 12 }}>{t.t(title)}</Text>
      {accountsOnly || toAccount ? null : (
        <TopTabs
          tabs={[
            { id: "category" as Tab, label: incoming ? "Incomes" : "Expenses" },
            { id: "account" as Tab, label: "Accounts" },
          ]}
          active={tab}
          onChange={setTab}
        />
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12, paddingTop: 18, paddingBottom: tab === "category" && !toAccount ? 30 : 0 }}>
        {tab === "category" && !toAccount
          ? categories.map((c) => <Tile key={c.id} icon={c.icon} color={c.color} name={c.name} figure={money(sum(data, c), c.currency ?? data.settings.currency)} onPress={() => pickCategory(c.id)} />)
          : null}
      </View>
      {tab === "account" || toAccount ? <AccountCards accounts={list} onPick={pickAccount} /> : null}
    </View>
  );
}

// "Take from" for the left tile, "Add to" for the right one; an adjustment picks only its own account.
export const openPartyPicker = (session: EditorSession, incoming: boolean, accountsOnly = false, onChosen?: () => void): number =>
  sheets.open(<Picker session={session} incoming={incoming} accountsOnly={accountsOnly} onChosen={onChosen} title={accountsOnly ? "Select account" : incoming ? "Take from" : "Add to"} />, "sheet", { bare: false });
// "To account": where a transfer from the account goes (AC 010).
export const openTransferPicker = (session: EditorSession, onChosen?: () => void): number => sheets.open(<Picker session={session} incoming={false} accountsOnly toAccount onChosen={onChosen} title="To account" />, "sheet", { bare: false });

// The same tiles for a choice that belongs to no operation (bulk edit): one account, or one category of
// either kind on two tabs.
function ChoiceSheet({ mode, onPick }: { mode: "account" | "category"; onPick: (id: string) => void }) {
  const data = useLedger();
  const t = useT();
  const p = usePalette();
  const money = useMoney();
  const close = useCloseLayer();
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const done = (id: string) => {
    close();
    onPick(id);
  };
  return (
    <View>
      <Text style={{ color: p.ink, fontSize: 25, fontWeight: "500", textAlign: "center", marginTop: 6, marginBottom: 12 }}>{t.t(mode === "account" ? "Select account" : "Select category")}</Text>
      {mode === "category" ? (
        <TopTabs
          tabs={[
            { id: "expense" as const, label: "Expenses" },
            { id: "income" as const, label: "Incomes" },
          ]}
          active={kind}
          onChange={setKind}
        />
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12, paddingTop: 18, paddingBottom: 30 }}>
        {mode === "account"
          ? data.accounts.filter((a) => !a.archived).map((a) => <Tile key={a.id} icon={a.icon} color={a.color} name={a.name} figure={money(accountBalance(data, a.id), a.currency)} onPress={() => done(a.id)} />)
          : data.categories.filter((c) => !c.archived && !c.parent && c.type === kind).map((c) => <Tile key={c.id} icon={c.icon} color={c.color} name={c.name} figure={money(sum(data, c), c.currency ?? data.settings.currency)} onPress={() => done(c.id)} />)}
      </View>
    </View>
  );
}

export const openChoice = (mode: "account" | "category", onPick: (id: string) => void): number => sheets.open(<ChoiceSheet mode={mode} onPick={onPick} />, "sheet", { bare: false });
