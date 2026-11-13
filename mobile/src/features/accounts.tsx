// The Accounts tab (js/screens/accounts/list.js): header, tabs (Accounts / Debts / Total), groups with
// their totals, rows with a badge, balance and progress, and the folders of finished and archived ones.
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Pressable } from "../ui/pressable.tsx";
import { WIDE_RETENTION } from "../ui/pager.tsx";
import { router } from "expo-router";
import { moveInOrder } from "../domain/accounts.ts";
import { accountBalance, debtDirection, progressForBalance } from "../domain/ledger.ts";
import { convert } from "../domain/money.ts";
import type { Account } from "../domain/types.ts";
import { useCommand, useLedger, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { Button, Icon } from "../ui/kit.tsx";
import { openCurrencySheet } from "../ui/currency-sheet.tsx";
import { Meter, MoneyText, SectionLabel, ToneBadge, TopTabs } from "../ui/parts.tsx";
import { Sortable } from "../ui/sortable.tsx";
import { Pager } from "../ui/pager.tsx";
import { HintBanner } from "../ui/hint-banner.tsx";
import { mix } from "../ui/theme.ts";
import { isOwed, openAccountSheet, percentText } from "./account-sheet.tsx";
import { RootHero } from "./root-hero.tsx";

type AccountTab = "Accounts" | "Debts" | "Total";

function useAccountParts() {
  const data = useLedger();
  const money = useMoney();
  const balanceOf = (a: Account) => accountBalance(data, a.id);
  const inMain = (n: number, from: string) => convert(n, from, data.settings.currency, data.rates);
  const isFinished = (a: Account) => {
    const progress = progressForBalance(a, balanceOf(a));
    return a.type === "Debt" ? balanceOf(a) === 0 : !!progress && progress.kind === "goal" && progress.left <= 0;
  };
  return { data, money, balanceOf, inMain, isFinished };
}

function AccountRow({ account, ignoreTap }: { account: Account; ignoreTap?: () => boolean }) {
  const { data, money, balanceOf } = useAccountParts();
  const p = usePalette();
  const t = useT();
  const balance = balanceOf(account);
  const progress = progressForBalance(account, balance);
  return (
    <Pressable
      accessibilityRole="button"
      pressRetentionOffset={WIDE_RETENTION}
      onPress={() => !ignoreTap?.() && openAccountSheet(account.id)}
      style={{
        minHeight: data.settings.bigAccounts ? 82 : 72,
        flexDirection: "row",
        alignItems: "center",
        gap: 16,
        paddingVertical: 8,
        paddingHorizontal: 9,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: p.line,
        backgroundColor: p.key,
      }}
    >
      <View style={{ width: 54, height: 54 }}>
        <ToneBadge icon={account.icon} color={account.color} size={54} iconSize={28} />
        {account.favorite ? (
          <Text accessibilityLabel="Favorite" style={{ position: "absolute", right: 0, bottom: -1, fontSize: 12, lineHeight: 12, color: p.accentInk }}>
            ★
          </Text>
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text numberOfLines={1} style={{ color: p.ink, fontSize: 17, lineHeight: 21 }}>
          {account.name}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <MoneyText text={money(balance, account.currency, true)} value={balance} />
          {progress ? (
            <>
              <Meter percent={progress.percent} owed={isOwed(progress.kind, progress.left, debtDirection(data, account) === "I owe")} />
              <Text style={{ minWidth: 52, textAlign: "right", color: p.inkSoft, fontSize: 15, fontVariant: ["tabular-nums"] }}>{percentText(progress.percent, t.locale)}</Text>
            </>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

// A group of rows; with `onHold` a long press lifts a row and it can be dragged to another place.
function Group({ accounts, onHold }: { accounts: Account[]; onHold?: (held: boolean) => void }) {
  const run = useCommand();
  if (!onHold)
    return (
      <View style={{ gap: 16, borderRadius: 15 }}>
        {accounts.map((a) => (
          <AccountRow key={a.id} account={a} />
        ))}
      </View>
    );
  return (
    <Sortable
      items={accounts}
      keyOf={(a) => a.id}
      onHold={onHold}
      style={{ gap: 16, borderRadius: 15 }}
      onReorder={(ids) => void run((tx) => (moveInOrder(tx, "accounts", ids), true))}
      render={(a, ignoreTap) => <AccountRow account={a} ignoreTap={ignoreTap} />}
    />
  );
}

// A folder that unfolds a list of accounts: the finished goals and debts, or the archive.
function Folder({ title, icon, items }: { title: string; icon: string; items: Account[] }) {
  const p = usePalette();
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <View style={{ marginTop: 28, borderTopWidth: 1, borderTopColor: p.line }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 4 }}>
        <Icon name={icon} size={20} color={p.muted} />
        <Text style={{ flex: 1, color: p.muted, fontSize: 15 }}>{`${t.t(title)} (${items.length})`}</Text>
        <Icon name={open ? "up" : "down"} size={14} color={p.muted} />
      </Pressable>
      {open ? (
        <View style={{ marginBottom: 16 }}>
          <Group accounts={items} />
        </View>
      ) : null}
    </View>
  );
}

function Totals() {
  const { data, money, balanceOf } = useAccountParts();
  const p = usePalette();
  const t = useT();
  const run = useCommand();
  const live = data.accounts.filter((a) => !a.archived && a.include);
  const excluded = data.accounts.filter((a) => !a.archived && !a.include).length;
  return (
    <View>
      {(["Total", "Regular", "Savings", "Debt"] as const).map((type, index) => {
        const rows = live.filter((a) => type === "Total" || a.type === type);
        if (!rows.length) return null;
        const currencies = [...new Set(rows.map((a) => a.currency))];
        const to = data.settings.totalCurrency?.[type] || data.settings.currency;
        const converted = rows.reduce((n, a) => n + convert(balanceOf(a), a.currency, to, data.rates), 0);
        return (
          <View key={type}>
            <SectionLabel first={index === 0} title={type === "Regular" ? "Accounts" : type === "Debt" ? "Debts" : type} />
            <View style={{ borderWidth: 1, borderColor: p.line, borderRadius: 13, overflow: "hidden", marginBottom: 20 }}>
              {currencies.map((c) => {
                const sum = rows.filter((a) => a.currency === c).reduce((n, a) => n + balanceOf(a), 0);
                return (
                  <View key={c} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 18, paddingHorizontal: 15 }}>
                    <Text style={{ flex: 1, color: p.ink, fontSize: 19 }}>{c}</Text>
                    <MoneyText text={money(sum, c)} value={sum} size={19} />
                  </View>
                );
              })}
              <Pressable
                accessibilityRole="button"
                onPress={() => openCurrencySheet(to, (code) => void run((tx) => (tx.setSettings({ totalCurrency: { ...data.settings.totalCurrency, [type]: code } }), true)))}
                style={{ padding: 18, alignItems: "center", backgroundColor: mix(p.positive, p.bg, 0.1), borderTopWidth: 1, borderTopColor: p.line }}
              >
                <MoneyText text={money(converted, to)} value={converted} size={20} />
              </Pressable>
            </View>
          </View>
        );
      })}
      {excluded ? (
        <Text style={{ color: p.inkSoft, fontSize: 13, marginHorizontal: 4, marginTop: 12 }}>
          {t.tc("{n} account is not counted here: it is switched off in “Include in overall balance”.", "{n} accounts are not counted here: they are switched off in “Include in overall balance”.", excluded)}
        </Text>
      ) : null}
    </View>
  );
}

export function AccountsScreen() {
  const { data, money, balanceOf, inMain, isFinished } = useAccountParts();
  const p = usePalette();
  const t = useT();
  const [tab, setTab] = useState<AccountTab>("Accounts");
  const [held, setHeld] = useState(false);
  const live = data.accounts.filter((a) => !a.archived);
  const archived = data.accounts.filter((a) => a.archived);
  const hasDebts = live.some((a) => a.type === "Debt");
  const tabs: AccountTab[] = hasDebts ? ["Accounts", "Debts", "Total"] : ["Accounts", "Total"];
  const shown = tabs.includes(tab) ? tab : "Accounts";

  const header = <RootHero icon="plus" label="New account" onAction={() => router.push("/account")} />;
  if (!data.accounts.length)
    return (
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        {header}
        <View style={{ padding: 24, gap: 12, alignItems: "center" }}>
          <Text style={{ color: p.ink, fontSize: 20, textAlign: "center" }}>{t.t("Accounts and savings will be here")}</Text>
          <Text style={{ color: p.muted, textAlign: "center" }}>{t.t("So far, there is not a single financial or savings account. Create your first financial or savings account?")}</Text>
          <Button label="Create" onPress={() => router.push("/account")} />
        </View>
      </View>
    );
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      {header}
      <TopTabs tabs={tabs.map((id) => ({ id, label: id }))} active={shown} onChange={setTab} />
      {/* The three tabs are pages side by side, all drawn, so a swipe uncovers the next one ready. */}
      <Pager
        prev={tabs[tabs.indexOf(shown) - 1] ?? null}
        current={shown}
        next={tabs[tabs.indexOf(shown) + 1] ?? null}
        onMove={(d) => setTab(tabs[tabs.indexOf(shown) + d] ?? shown)}
        render={(page) => {
          const list = page === "Debts" ? live.filter((a) => a.type === "Debt") : live.filter((a) => a.type !== "Debt");
          const completed = list.filter(isFinished);
          const open = list.filter((a) => !isFinished(a));
          const groups = page === "Debts" ? (["Owe me", "I owe"] as const) : (["Regular", "Savings"] as const);
          return (
          <ScrollView scrollEnabled={!held} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            {page !== "Total" && list.length > 1 ? <HintBanner id="account-reorder" text="Hold an account to drag and reorder" /> : null}
            {page === "Total" ? (
              <Totals />
            ) : (
              <>
                {groups.map((type, index) => {
                  const rows = open.filter((a) => (a.type === "Debt" ? type === debtDirection(data, a) : a.type === type));
                  if (!rows.length && type !== "Savings") return null;
                  const total = rows.reduce((n, a) => n + inMain(balanceOf(a), a.currency), 0);
                  return (
                    <View key={type}>
                      <SectionLabel first={index === 0} title={type === "Regular" ? "Accounts" : type} right={<MoneyText text={money(total, data.settings.currency, true)} value={total} size={19} />} />
                      {rows.length ? <Group accounts={rows} onHold={setHeld} /> : null}
                    </View>
                  );
                })}
                <Folder title="Completed" icon="check" items={completed} />
              </>
            )}
            <Folder title="Archive" icon="archive" items={archived} />
          </ScrollView>
          );
        }}
      />
    </View>
  );
}
