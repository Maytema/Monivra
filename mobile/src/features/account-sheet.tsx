// The sheet that opens when an account is tapped (js/screens/accounts/actions.js): the account in a
// card with its balance, the progress block, and six actions in a grid.
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { toggleFavoriteAccount, setArchived } from "../domain/accounts.ts";
import { accountBalance, accountById, cardState, progressForBalance, debtDirection } from "../domain/ledger.ts";
import { shownPercent } from "../domain/money.ts";
import type { Account } from "../domain/types.ts";
import { useCommand, useLedger, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { Icon } from "../ui/kit.tsx";
import { ActionGrid, ActionTile, Meter, MoneyText, ToneBadge } from "../ui/parts.tsx";
import { sheets, useCloseLayer } from "../ui/sheets.tsx";
import { openEditor } from "./editor/editor-sheet.tsx";

export const percentText = (percent: number): string => `${shownPercent(percent).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;

export const openAccountSheet = (id: string): number => sheets.open(<AccountSheet id={id} />);

// A debt I still have to pay back is shown in a soft red, everything else in green.
export function isOwed(kind: string, left: number, owedByMe: boolean): boolean {
  return kind === "debt" && left > 0 && owedByMe;
}

function ProgressBlock({ account }: { account: Account }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  const balance = accountBalance(data, account.id);
  const progress = progressForBalance(account, balance);
  if (!progress) return null;
  const m = (n: number) => money(n, account.currency);
  const say = (text: string, amount: number) => t.t(text, { amount: m(amount) });
  let status: string;
  if (progress.kind === "limit") {
    const card = cardState(account, balance);
    status = [card && card.own !== 0 && say("Own funds: {amount}", card.own), card && card.creditUsed > 0 && say("Credit used: {amount}", card.creditUsed)].filter(Boolean).join(" · ");
  } else if (progress.kind === "debt")
    status = progress.left > 0 ? say("Paid back: {amount}", progress.done) : progress.left < 0 ? say("Overpaid by {amount}", -progress.left) : t.t("Debt repaid");
  else if (progress.left > 0) status = say("To goal: {amount}", progress.left);
  else if (progress.left < 0) status = say("Goal exceeded by {amount}", -progress.left);
  else status = t.t("Goal reached");
  const title = { goal: "Goal", debt: "Total debt", limit: "Limit" }[progress.kind];
  const owed = isOwed(progress.kind, progress.left, debtDirection(data, account) === "I owe");
  return (
    <View style={{ marginTop: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: p.ink, fontSize: 15 }}>{`${t.t(title)} ${m(progress.target)}`}</Text>
        <Text style={{ color: p.inkSoft, fontSize: 15 }}>{percentText(progress.percent)}</Text>
      </View>
      <View style={{ height: 16, marginTop: 10, marginBottom: 8, flexDirection: "row" }}>
        <Meter percent={progress.percent} owed={owed} height={16} />
      </View>
      {status ? <Text style={{ color: p.muted, fontSize: 13 }}>{status}</Text> : null}
    </View>
  );
}

function AccountSheet({ id }: { id: string }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  const run = useCommand();
  const close = useCloseLayer();
  const account = accountById(data, id);
  if (!account) return null;
  const balance = accountBalance(data, id);
  const available = account.type === "Regular" && account.limit > 0;
  const figure = (label: string, amount: number) => (
    <View style={{ flex: 1, minWidth: 140, alignItems: "center" }}>
      <Text style={{ color: p.ink, fontSize: 13 }}>{t.t(label)}</Text>
      <MoneyText text={money(amount, account.currency, true)} value={amount} size={18} style={{ marginTop: 10 }} />
    </View>
  );
  // An account action replaces the sheet, so one "back" returns to the list.
  const start = (type: string, key: "to" | "from") => {
    close();
    openEditor({ type: type as "income" | "expense" | "transfer", [key]: id });
  };
  return (
    <View>
      <View style={{ marginTop: 8, marginHorizontal: 4, paddingTop: 16, paddingHorizontal: 18, paddingBottom: 18, borderWidth: 1, borderColor: p.line, borderRadius: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <ToneBadge icon={account.icon} color={account.color} size={56} iconSize={28} />
          <Text style={{ flex: 1, color: p.ink, fontSize: 18 }}>{account.name}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t.t("Favorite")} hitSlop={10} onPress={() => void run((tx) => (toggleFavoriteAccount(tx, id), true))}>
            <Icon name="star" size={26} color={account.favorite ? p.accentInk : p.accent} filled={account.favorite} />
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
          {figure("Current balance", balance)}
          {available ? figure("Available to spend", balance + account.limit) : null}
        </View>
        <ProgressBlock account={account} />
      </View>
      <ActionGrid>
        <ActionTile
          icon="edit"
          label="Edit"
          tone="#c04fd8"
          onPress={() => {
            close();
            router.push({ pathname: "/account", params: { id } });
          }}
        />
        <ActionTile
          icon="archive"
          label={account.archived ? "Return from archive" : "Move to archive"}
          tone="#7d7886"
          onPress={() => {
            if (run((tx) => (setArchived(tx, id, !account.archived), true))) close();
          }}
        />
        <ActionTile
          icon="receipt"
          label="Operations"
          tone="#1f8fe0"
          onPress={() => {
            close();
            router.push({ pathname: "/filtered", params: { account: id } });
          }}
        />
        <ActionTile icon="income" label="Top up" tone="#22b573" onPress={() => start("income", "to")} />
        <ActionTile icon="right" label="Transfer" tone="#f2a313" onPress={() => start("transfer", "from")} />
        <ActionTile icon="expense" label="Debit" tone="#e5384f" onPress={() => start("expense", "from")} />
      </ActionGrid>
    </View>
  );
}
