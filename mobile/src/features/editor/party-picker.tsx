// The sheet behind a tile of the editor (js/screens/operation-editor/parties.js `counterpartyPicker`,
// `transferDestinationPicker`): categories and accounts as tiles, on two tabs. Choosing puts the item
// on that side of the operation and closes the sheet.
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { accountBalance, categoryById } from "../../domain/ledger.ts";
import type { Account, Category, LedgerData } from "../../domain/types.ts";
import { useLedger, useMoney, usePalette, useT } from "../../ui/app-context.tsx";
import { ToneBadge, TopTabs } from "../../ui/parts.tsx";
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

export const sum = (data: LedgerData, category: Category): number => data.ops.filter((o) => o.category === category.id || categoryById(data, o.category)?.parent === category.id).reduce((n, o) => n + o.amount, 0);

function Picker({ session, incoming, accountsOnly, title }: { session: EditorSession; incoming: boolean; accountsOnly: boolean; title: string }) {
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
    if (accountsOnly) session.replaceOwnAccount(id);
    else session.putAccount(incoming, id);
  };
  const pickCategory = (id: string) => {
    close();
    session.putCategory(incoming, id);
  };
  return (
    <View>
      <Text style={{ color: p.ink, fontSize: 25, fontWeight: "500", textAlign: "center", marginTop: 6, marginBottom: 12 }}>{t.t(title)}</Text>
      {accountsOnly ? null : (
        <TopTabs
          tabs={[
            { id: "category" as Tab, label: incoming ? "Incomes" : "Expenses" },
            { id: "account" as Tab, label: "Accounts" },
          ]}
          active={tab}
          onChange={setTab}
        />
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12, paddingTop: 18, paddingBottom: 30 }}>
        {tab === "category"
          ? categories.map((c) => <Tile key={c.id} icon={c.icon} color={c.color} name={c.name} figure={money(sum(data, c), c.currency ?? data.settings.currency)} onPress={() => pickCategory(c.id)} />)
          : accounts.map((a) => <Tile key={a.id} icon={a.icon} color={a.color} name={a.name} figure={money(accountBalance(data, a.id), a.currency)} onPress={() => pickAccount(a.id)} />)}
      </View>
    </View>
  );
}

// "Take from" for the left tile, "Add to" for the right one; an adjustment picks only its own account.
export const openPartyPicker = (session: EditorSession, incoming: boolean, accountsOnly = false): number =>
  sheets.open(<Picker session={session} incoming={incoming} accountsOnly={accountsOnly} title={accountsOnly ? "Select account" : incoming ? "Take from" : "Add to"} />, "sheet", { bare: false });

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
