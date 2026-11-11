// More: budgets, scheduled payments, exchange rates, data, settings; and those pages.
import { useMemo, useState } from "react";
import { Alert, Linking, Text, View } from "react-native";
import { router } from "expo-router";
import { APP_VERSION } from "../application/store.ts";
import { changeMainCurrency } from "../domain/accounts.ts";
import { budgetState, deleteBudget, saveBudget } from "../domain/categories.ts";
import { FileProblem } from "../domain/datafile.ts";
import type { Budget, BudgetPeriod, Settings } from "../domain/types.ts";
import { LANGUAGES } from "../i18n/index.ts";
import { fetcher } from "../platform/network.ts";
import { pickTextFile, shareTextFile } from "../platform/files.ts";
import { notificationsAllowed } from "../platform/notifications.ts";
import { biometricAvailable } from "../platform/lock.ts";
import { PinSettings } from "./lock.tsx";
import { RATE_PROVIDERS } from "../services/rates/providers.ts";
import type { RateUpdateState } from "../services/rates/refresh.ts";
import { appStore, showError, useCommand, useLedger, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { Button, Card, ChoiceField, Field, Icon, Label, Row, Screen, Toggle } from "../ui/kit.tsx";
import { CategoryPicker, OptionPicker, Panel } from "../ui/pickers.tsx";
import { font, space } from "../ui/theme.ts";
import { AmountField } from "./accounts.tsx";
import { useView } from "./ui-state.ts";

const MENU = [
  ["Budgets", "goal", "/budgets"],
  ["Scheduled payments", "repeat", "/scheduled"],
  ["Exchange rates", "trend", "/rates"],
  ["Data", "save", "/data"],
  ["Settings", "gear", "/settings"],
] as const;

export function MoreScreen() {
  const t = useT();
  const p = usePalette();
  return (
    <Screen>
      <Card style={{ paddingHorizontal: space.s }}>
        {MENU.map(([label, icon, href]) => (
          <Row key={href} left={<Icon name={icon} color={p.accentInk} />} title={t.t(label)} right={<Icon name="right" size={18} color={p.muted} />} onPress={() => router.push(href)} />
        ))}
      </Card>
      <Label>{`Monivra ${APP_VERSION} · React Native`}</Label>
    </Screen>
  );
}

// ---- Data: moving data between the applications ---------------------------------------------------
export function DataScreen() {
  const t = useT();
  const data = useLedger();
  const [busy, setBusy] = useState(false);
  const exportFile = async () => {
    setBusy(true);
    try {
      await shareTextFile(`monivra-backup-${appStore().env.clock.today()}.json`, appStore().exportDataFile());
    } catch (error) {
      showError(t, error);
    } finally {
      setBusy(false);
    }
  };
  const importFile = () =>
    Alert.alert(t.t("Replace the data with a file?"), t.t("Everything in this application is replaced by the file. Save a data file first if you may need what is here now."), [
      { text: t.t("Cancel"), style: "cancel" },
      {
        text: t.t("Choose file"),
        onPress: async () => {
          setBusy(true);
          try {
            const text = await pickTextFile();
            if (text === null) return;
            const counts = appStore().importDataFile(text);
            Alert.alert(t.t("Data imported"), t.t("Accounts: {a}. Operations: {o}. Scheduled payments: {s}.", { a: counts.accounts, o: counts.ops, s: counts.scheduled }));
          } catch (error) {
            const why = error instanceof FileProblem && error.problem ? `${t.t(error.problem.what)} ${error.problem.number || ""}: ${t.t(error.problem.reason)}` : error instanceof Error ? error.message : "";
            Alert.alert(t.t("The file could not be used. Nothing was changed."), why);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  return (
    <Screen>
      <Card>
        <Label>{t.t("Accounts: {a}. Operations: {o}. Scheduled payments: {s}.", { a: data.accounts.length, o: data.ops.length, s: data.scheduled.length })}</Label>
      </Card>
      <Button label="Save data file" onPress={() => void exportFile()} disabled={busy} />
      <Label>{t.t("A data file holds everything you recorded. The old app can read it too.")}</Label>
      <Button label="Bring data from a file" kind="outline" onPress={importFile} disabled={busy} />
      <Label>{t.t("Use a data file saved in the old app (More → Data) or in this one.")}</Label>
    </Screen>
  );
}

// ---- Exchange rates ---------------------------------------------------------------------------------
export function RatesScreen() {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const run = useCommand();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const state = data.settings.rateUpdate as RateUpdateState | undefined;
  const used = useMemo(
    () => [...new Set([data.settings.currency, ...data.accounts.map((a) => a.currency), ...data.categories.map((c) => c.currency), "USD", "EUR", "RUB", "KZT", "CNY"])].filter((c) => c !== "KGS" && c in data.rates).sort(),
    [data],
  );
  const update = async () => {
    setBusy(true);
    const result = await appStore().updateRates(fetcher, true);
    setBusy(false);
    if (result && !result.ok) Alert.alert(t.t("The rates could not be updated"), t.t("No source answered. The rates stay as they were; you can edit them by hand."));
  };
  const fixed = data.settings.fixedRates ?? [];
  const usedProviders = new Set(Object.values(state?.sources ?? {}).map((s) => s.provider));
  return (
    <Screen>
      <Toggle label="Automatic rates" value={!!data.settings.autoRates} onChange={(autoRates) => run((tx) => (tx.setSettings({ autoRates }), true))} hint="Updated about twice a day from free public sources when the internet is available." />
      <Button label={busy ? "Updating…" : "Update now"} kind="outline" onPress={() => void update()} disabled={busy} />
      {state ? (
        <Label>{`${t.t("Last attempt")}: ${state.at.slice(0, 16).replace("T", " ")} UTC · ${state.ok ? t.t("updated") : t.t("no source answered")}`}</Label>
      ) : null}
      {RATE_PROVIDERS.filter((x) => x.attribution && usedProviders.has(x.id)).map((x) => (
        <Text key={x.id} style={{ color: p.accentInk, fontSize: font.small }} onPress={() => void Linking.openURL(x.attribution!.url)}>
          {x.attribution!.text}
        </Text>
      ))}
      <Label>{t.t("Rates are how many KGS one unit is worth. An edited rate is kept out of automatic updates. Saved operations keep their amounts.")}</Label>
      <Card style={{ paddingHorizontal: space.s }}>
        {used.map((code) => (
          <Row
            key={code}
            title={code}
            subtitle={fixed.includes(code) ? t.t("Kept by hand") : state?.sources[code] ? `${t.t("Source")}: ${state.sources[code]!.provider}` : undefined}
            right={<Text style={{ color: p.ink }}>{data.rates[code]}</Text>}
            onPress={() => (setEditing(code), setValue(String(data.rates[code] ?? "")))}
          />
        ))}
      </Card>
      <Panel visible={editing !== null} title={editing ?? ""} onClose={() => setEditing(null)}>
        <View style={{ padding: space.l, gap: space.m }}>
          <Field label="KGS for one unit" value={value} onChange={setValue} keyboard="decimal-pad" />
          <Button
            label="Save"
            onPress={() => {
              const rate = Number(value.replace(",", "."));
              if (!editing || !(rate > 0) || !Number.isFinite(rate)) return Alert.alert(t.t("Enter a valid amount"));
              run((tx) => {
                tx.setRates({ ...tx.data.rates, [editing]: rate });
                tx.setSettings({ fixedRates: [...new Set([...(tx.data.settings.fixedRates ?? []), editing])] });
                return true;
              });
              setEditing(null);
            }}
          />
          {editing && fixed.includes(editing) ? (
            <Button label="Update automatically again" kind="outline" onPress={() => (run((tx) => (tx.setSettings({ fixedRates: fixed.filter((c) => c !== editing) }), true)), setEditing(null))} />
          ) : null}
        </View>
      </Panel>
    </Screen>
  );
}

// ---- Settings -------------------------------------------------------------------------------------
const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "As in the system" },
] as const;

export function SettingsScreen() {
  const data = useLedger();
  const t = useT();
  const run = useCommand();
  const [picking, setPicking] = useState<"language" | "theme" | "currency" | null>(null);
  const setSetting = (patch: Partial<Settings>) => run((tx) => (tx.setSettings(patch), true));
  return (
    <Screen>
      <ChoiceField label="Language" value={LANGUAGES.find((l) => l.code === data.settings.language)?.name ?? data.settings.language} onPress={() => setPicking("language")} />
      <ChoiceField label="Theme" value={t.t(THEMES.find((x) => x.value === data.settings.theme)?.label ?? "")} onPress={() => setPicking("theme")} />
      <ChoiceField label="Main currency" value={data.settings.currency} onPress={() => setPicking("currency")} />
      <Toggle label="Hide amounts" value={!!data.settings.hidden} onChange={(hidden) => setSetting({ hidden })} />
      <Label>{t.t("Screen lock")}</Label>
      <PinSettings />
      {data.settings.pin ? (
        <>
          <Toggle
            label="Unlock with fingerprint"
            value={!!data.settings.biometric}
            onChange={async (biometric) => {
              if (biometric && !(await biometricAvailable())) return void Alert.alert(t.t("No fingerprint or face is set up on this phone."));
              setSetting({ biometric });
            }}
          />
          <Toggle label="Lock again after leaving the app" value={!!data.settings.relock} onChange={(relock) => setSetting({ relock })} />
        </>
      ) : null}
      <Toggle
        label="Reminders"
        value={!!data.settings.notifications}
        hint="Notifications about scheduled payments, also when the app is closed. They remind; the payment is recorded when the app runs."
        onChange={async (on) => {
          if (!on) return void setSetting({ notifications: false });
          if (await notificationsAllowed(true)) setSetting({ notifications: true });
          else Alert.alert(t.t("Notifications are not allowed"), t.t("Allow notifications for Monivra in the system settings."));
        }}
      />
      {data.settings.notifications ? (
        <>
          <Toggle label="Daily reminder to enter operations" value={!!data.settings.periodic} onChange={(periodic) => setSetting({ periodic })} />
          {data.settings.periodic ? <TimeField label="Time of the reminder" value={data.settings.notificationTime} onValid={(notificationTime) => setSetting({ notificationTime })} /> : null}
        </>
      ) : null}
      <OptionPicker visible={picking === "language"} title="Language" options={LANGUAGES.map((l) => ({ value: l.code as string, label: l.name }))} value={data.settings.language} onPick={(language) => setSetting({ language })} onClose={() => setPicking(null)} />
      <OptionPicker visible={picking === "theme"} title="Theme" options={THEMES} value={data.settings.theme} onPick={(theme) => setSetting({ theme })} onClose={() => setPicking(null)} />
      <OptionPicker
        visible={picking === "currency"}
        title="Main currency"
        options={Object.keys(data.rates).sort().map((c) => ({ value: c, label: c }))}
        value={data.settings.currency}
        onPick={(currency) => run((tx) => (changeMainCurrency(tx, currency), true))}
        onClose={() => setPicking(null)}
      />
    </Screen>
  );
}

// ---- Budgets ----------------------------------------------------------------------------------------
const PERIODS: { value: BudgetPeriod; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

export function BudgetsScreen() {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const money = useMoney();
  const run = useCommand();
  const { period } = useView();
  const [draft, setDraft] = useState<(Omit<Budget, "id"> & { id: string | null }) | null>(null);
  const [picking, setPicking] = useState<"period" | "category" | null>(null);
  const blank = () => setDraft({ id: null, name: "", amount: 0, currency: data.settings.currency, period: "month", categories: null });
  return (
    <Screen>
      {data.budgets.map((b) => {
        const s = budgetState(data, b, period.anchor);
        return (
          <Card key={b.id} onPress={() => setDraft({ ...b })}>
            <Row title={b.name || t.t("Budget")} subtitle={b.categories ? b.categories.map((id) => data.categories.find((c) => c.id === id)?.name).join(", ") : t.t("All expenses")} right={<Text style={{ color: p.ink }}>{money(b.amount, b.currency)}</Text>} />
            <View style={{ height: 8, borderRadius: 4, backgroundColor: p.line }}>
              <View style={{ height: 8, borderRadius: 4, width: `${Math.min(100, s.share)}%`, backgroundColor: s.left < 0 ? p.negative : p.accent }} />
            </View>
            <Label>{s.left >= 0 ? `${t.t("Left")}: ${money(s.left, b.currency)}` : `${t.t("Over by")}: ${money(-s.left, b.currency)}`}</Label>
          </Card>
        );
      })}
      <Button label="New budget" onPress={blank} />
      <Panel visible={draft !== null} title={draft?.id ? "Change budget" : "New budget"} onClose={() => setDraft(null)}>
        {draft ? (
          <View style={{ padding: space.l, gap: space.m }}>
            <Field label="Title" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
            <AmountField label="Budget" value={draft.amount} onChange={(amount) => setDraft({ ...draft, amount })} />
            <ChoiceField label="Period" value={t.t(PERIODS.find((x) => x.value === draft.period)?.label ?? "")} onPress={() => setPicking("period")} />
            <ChoiceField label="Categories" value={draft.categories ? draft.categories.map((id) => data.categories.find((c) => c.id === id)?.name).join(", ") : t.t("All expenses")} onPress={() => setPicking("category")} />
            {draft.categories ? <Button label="All expenses" kind="text" onPress={() => setDraft({ ...draft, categories: null })} /> : null}
            <Button label="Save" onPress={() => run((tx, env) => saveBudget(tx, draft, env)) && setDraft(null)} />
            {draft.id ? <Button label="Delete" kind="danger" onPress={() => run((tx) => (deleteBudget(tx, draft.id!), true)) && setDraft(null)} /> : null}
          </View>
        ) : null}
      </Panel>
      <OptionPicker visible={picking === "period"} title="Period" options={PERIODS} value={draft?.period ?? "month"} onPick={(v) => draft && setDraft({ ...draft, period: v })} onClose={() => setPicking(null)} />
      <CategoryPicker visible={picking === "category"} type="expense" onPick={(c) => draft && setDraft({ ...draft, categories: [...new Set([...(draft.categories ?? []), c.id])] })} onClose={() => setPicking(null)} />
    </Screen>
  );
}

// A time "HH:MM" typed freely; it is taken once it is a real time.
function TimeField({ label, value, onValid }: { label: string; value: string; onValid: (v: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <Field
      label={label}
      value={text}
      keyboard="numeric"
      placeholder="20:00"
      onChange={(v) => {
        setText(v);
        if (/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) onValid(v);
      }}
    />
  );
}
