// Settings (js/screens/settings.js, more/settings-pages.js): the list of sections, and under it the pages of
// formatting, styles and elements, notifications, security, privacy, backups and rates. One route shows
// a page by its name; the pages are described here as a table, as in the first application.
import { useState, type ReactNode } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { changeMainCurrency } from "../domain/accounts.ts";
import { formatNumber, NUMBER_FORMATS } from "../domain/money.ts";
import type { Settings } from "../domain/types.ts";
import { LANGUAGES } from "../i18n/index.ts";
import { biometricAvailable, biometricUnlock } from "../platform/lock.ts";
import { notificationsAllowed, sendTestNotification } from "../platform/notifications.ts";
import { appStore, useCommand, useLedger, useMoney, usePalette, useT } from "../ui/app-context.tsx";
import { TextButton, PrimaryPill } from "../ui/calendar-sheet.tsx";
import { openCurrencySheet } from "../ui/currency-sheet.tsx";
import { confirmDialog, DialogActions, DialogTitle, optionDialog, toast } from "../ui/dialogs.tsx";
import { THEME_COLORS } from "../ui/icon-groups.ts";
import { Icon } from "../ui/kit.tsx";
import { openMonthStart } from "../ui/period-dialog.tsx";
import { Footnote, SettingRow, SwitchRow } from "../ui/rows.tsx";
import { sheets, useCloseLayer } from "../ui/sheets.tsx";
import { Sortable } from "../ui/sortable.tsx";
import { openTime } from "./editor/options.tsx";
import { PinSettings, setLock } from "./lock.tsx";

type Key = keyof Settings & string;

function useSetting() {
  const data = useLedger();
  const run = useCommand();
  const set = (patch: Partial<Settings>) => run((tx) => (tx.setSettings(patch), true));
  return { data, s: data.settings, set };
}

// A row with the current choice under its title that opens a list of options.
function OptionsRow<V extends string | number>({ label, k, options }: { label: string; k: Key; options: readonly (readonly [V, string])[] }) {
  const { s, set } = useSetting();
  const current = options.find(([v]) => v === s[k]);
  return <SettingRow title={label} caption={current?.[1] ?? String(s[k])} onPress={() => optionDialog<string>(label, options.map(([v, l]) => ({ value: String(v), label: l })), String(s[k]), (v) => set({ [k]: typeof options[0]?.[0] === "number" ? Number(v) : v }))} chevron={false} />;
}

function Switch({ label, k, hint }: { label: string; k: Key; hint?: string }) {
  const { s, set } = useSetting();
  return <SwitchRow label={label} hint={hint} value={!!s[k]} onChange={(on) => set({ [k]: on })} />;
}

// ---- Formatting -------------------------------------------------------------------------------------
function CurrencyFormat() {
  const { s, set } = useSetting();
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const [draft, setDraft] = useState({ numberFormat: s.numberFormat, currencyFirst: s.currencyFirst, groupDigits: s.groupDigits, decimal: s.decimal });
  const toggles = [
    ["Currency symbol first", "currencyFirst"],
    ["Group by 3 digits", "groupDigits"],
    ["Two decimal places", "decimal"],
  ] as const;
  return (
    <View>
      <DialogTitle>{t.t("Currency format")}</DialogTitle>
      {NUMBER_FORMATS.map((id) => (
        <Pressable key={id} accessibilityRole="radio" accessibilityState={{ selected: draft.numberFormat === id }} onPress={() => setDraft({ ...draft, numberFormat: id })} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12 }}>
          <Text style={{ flex: 1, color: p.ink, fontSize: 16 }}>{`${formatNumber(123456789, id, true, 2)} ${s.currency}`}</Text>
          <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: draft.numberFormat === id ? p.accent : p.muted, alignItems: "center", justifyContent: "center" }}>{draft.numberFormat === id ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: p.accent }} /> : null}</View>
        </Pressable>
      ))}
      {toggles.map(([label, key]) => (
        <SwitchRow key={key} label={label} value={draft[key]} onChange={(on) => setDraft({ ...draft, [key]: on })} />
      ))}
      <DialogActions>
        <TextButton label="Cancel" onPress={close} />
        <PrimaryPill
          label="Save"
          onPress={() => {
            set(draft);
            close();
          }}
        />
      </DialogActions>
    </View>
  );
}

function Formatting() {
  const { s } = useSetting();
  const run = useCommand();
  const money = useMoney();
  return (
    <>
      <SettingRow title="Main currency" caption={s.currency} onPress={() => openCurrencySheet(s.currency, (code) => void run((tx) => (changeMainCurrency(tx, code), true)))} />
      <SettingRow title="Currency format" caption={money(12345678900, s.currency)} onPress={() => sheets.open(<CurrencyFormat />, "sheet")} />
      <Switch label="Hide cents" k="hideCents" hint="Amounts are shown rounded to whole units" />
      <OptionsRow label="Date format" k="dateFormat" options={[["month", "Month | day | year"], ["day", "Day | month | year"], ["iso", "Year | month | day"]]} />
      <SettingRow title="Start of month" caption={String(s.monthStart)} onPress={openMonthStart} />
      <OptionsRow label="First day of week" k="weekStart" options={[[1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"], [0, "Sunday"]]} />
    </>
  );
}

// ---- Styles and elements ----------------------------------------------------------------------------
const go = (page: string) => () => router.push({ pathname: "/settings-page", params: { page } });

function ColorTheme() {
  const { s, set } = useSetting();
  const p = usePalette();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, padding: 18, justifyContent: "center" }}>
      {THEME_COLORS.map((c) => (
        <Pressable key={c} accessibilityRole="button" accessibilityLabel={c} accessibilityState={{ selected: s.accent === c }} onPress={() => set({ accent: c })} style={{ width: "21%", aspectRatio: 1, borderRadius: 18, backgroundColor: c, alignItems: "center", justifyContent: "center", borderWidth: s.accent === c ? 3 : 0, borderColor: p.ink }}>
          {s.accent === c ? <Icon name="check" size={26} color="#ffffff" /> : null}
        </Pressable>
      ))}
    </View>
  );
}

function Language() {
  const { s, set } = useSetting();
  const p = usePalette();
  return (
    <>
      {LANGUAGES.map((l) => (
        <Pressable key={l.code} accessibilityRole="radio" accessibilityState={{ selected: s.language === l.code }} onPress={() => set({ language: l.code })} style={{ flexDirection: "row", alignItems: "center", minHeight: 56, paddingHorizontal: 18 }}>
          <Text style={{ flex: 1, color: p.ink, fontSize: 16 }}>{l.name}</Text>
          <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: s.language === l.code ? p.accent : p.muted, alignItems: "center", justifyContent: "center" }}>{s.language === l.code ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: p.accent }} /> : null}</View>
        </Pressable>
      ))}
    </>
  );
}

const STATS_BLOCKS = [
  ["flow", "Cash flow"],
  ["scheduled", "Scheduled payments"],
  ["bar", "Charts"],
  ["average", "Average values"],
  ["donut", "Diagram"],
  ["categories", "Categories"],
  ["tags", "Tags"],
] as const;

// The blocks of the statistics screen, switched on and off; the switched-on ones first, in their order,
// and a held row is dragged to move its block (js/screens/statistics.js statsSettings).
function StatsSettings() {
  const { s, set } = useSetting();
  const t = useT();
  const close = useCloseLayer();
  const names = new Map<string, string>(STATS_BLOCKS);
  const ordered = [...s.stats.filter((id) => names.has(id)), ...STATS_BLOCKS.map(([id]) => id).filter((id) => !s.stats.includes(id))];
  return (
    <View>
      <DialogTitle>{t.t("Statistics")}</DialogTitle>
      <Footnote>Hold a row and drag it to change the order.</Footnote>
      <Sortable
        items={ordered}
        keyOf={(id) => id}
        onReorder={(ids) => set({ stats: ids.filter((id) => s.stats.includes(id)) })}
        render={(id, ignoreTap) => <SwitchRow label={names.get(id) ?? id} value={s.stats.includes(id)} onChange={(on) => !ignoreTap() && set({ stats: on ? [...s.stats, id] : s.stats.filter((x) => x !== id) })} />}
      />
      <DialogActions>
        <PrimaryPill label="Complete" onPress={close} />
      </DialogActions>
    </View>
  );
}

// ---- Notifications, security, privacy -----------------------------------------------------------------
function Notifications() {
  const { s, set } = useSetting();
  const t = useT();
  return (
    <>
      <SwitchRow
        label="Notifications"
        hint="Notifications about scheduled payments, also when the app is closed. They remind; the payment is recorded when the app runs."
        value={!!s.notifications}
        onChange={async (on) => {
          if (!on) return void set({ notifications: false });
          if (await notificationsAllowed(true)) set({ notifications: true });
          else Alert.alert(t.t("Notifications are not allowed"), t.t("Allow notifications for Monivra in the system settings."));
        }}
      />
      <Switch label="Periodic reminders" k="periodic" />
      <SettingRow title="Time" caption={s.notificationTime} onPress={() => openTime(s.notificationTime, (time) => set({ notificationTime: time }))} chevron={false} />
      <OptionsRow label="Frequency" k="notificationFrequency" options={[["Every day", "Every day"], ["Weekdays", "Weekdays"], ["Weekends", "Weekends"]]} />
      <SettingRow
        title="Test notification"
        icon="bell"
        onPress={() =>
          void sendTestNotification(s.language)
            .then((sent) => (sent ? toast(t.t("Notification sent")) : Alert.alert(t.t("Notifications are not allowed"), t.t("Allow notifications for Monivra in the system settings."))))
            .catch(() => toast(t.t("Notifications are not allowed")))
        }
      />
      <Footnote>Android may deliver a reminder a few minutes late to save battery. A payment itself is added to your operations when you open Monivra, with the date and time it was set for.</Footnote>
    </>
  );
}

function Security() {
  const { s, set } = useSetting();
  const t = useT();
  const pinOn = !!s.pin;
  return (
    <>
      <View style={{ paddingHorizontal: 18, paddingVertical: 8 }}>
        <PinSettings />
      </View>
      {pinOn ? (
        <>
          <SwitchRow
            label="Unlock with fingerprint or face"
            value={!!s.biometric}
            onChange={async (on) => {
              if (!on) return void set({ biometric: false });
              if (!(await biometricAvailable())) return toast("Set up a fingerprint or face in your phone settings first");
              // Switching it on needs one successful check, so a person who cannot use it is not locked out.
              if (await biometricUnlock(t.t("Unlock Monivra"), t.t("Use PIN"))) set({ biometric: true });
            }}
          />
          <Switch label="Lock after leaving" k="relock" />
          <OptionsRow label="Lock delay" k="lockDelay" options={[[0, "Immediately"], [30, "30 seconds"], [60, "1 minute"], [300, "5 minutes"]]} />
          <SettingRow title="Lock now" icon="lock" onPress={() => setLock({ locked: true })} chevron={false} />
          {!s.relock ? <Footnote>The app asks for the PIN only when it starts. Turn on “Lock after leaving” to lock it when you switch to another app or to the home screen; the delay below then applies.</Footnote> : null}
        </>
      ) : null}
      <Footnote>The PIN only hides the screen; data on the device is not encrypted.</Footnote>
    </>
  );
}

function Privacy() {
  return (
    <>
      <Switch label="Hide preview" k="hidePreview" hint="Cover the screen while the app is in the background" />
      <OptionsRow label="Hidden values" k="hiddenValues" options={[["Hide all", "Hide all"], ["Balances only", "Balances only"]]} />
      <Switch label="Hide balances" k="hidden" />
    </>
  );
}

function Backups() {
  const t = useT();
  return (
    <>
      <SettingRow title="Saved backups" caption="Create and restore data from automatic local copies" onPress={() => router.push({ pathname: "/data", params: { page: "backups" } })} />
      <Switch label="Save locally" k="autoBackup" hint="Copy the data locally once a day. This increases the size of the data on the device. Only the latest copies are stored." />
      <SettingRow
        title="Delete all local data copies"
        caption="Delete all local backups from storage. Deleted data cannot be restored."
        chevron={false}
        onPress={() =>
          appStore().backups().length
            ? confirmDialog("Delete backups", () => (appStore().deleteData("backups"), toast(t.t("Data deleted"))), true, "Delete", t.t("The backups kept inside the app will be deleted. Your data stays."))
            : toast(t.t("There is nothing to delete"))
        }
      />
    </>
  );
}

// ---- The table of pages ---------------------------------------------------------------------------------
interface Page {
  title: string;
  body: () => ReactNode;
}

const PAGES: Record<string, Page> = {
  formatting: { title: "Formatting", body: () => <Formatting /> },
  styles: {
    title: "Styles and elements",
    body: () => (
      <>
        <SettingRow title="Global" caption="Appearance of the entire application" onPress={go("stylesGlobal")} />
        <SettingRow title="Bottom navigation" caption="Bottom navigation elements style" onPress={go("stylesNavigation")} />
        <SettingRow title="Elements" caption="Presence on screens" onPress={go("stylesElements")} />
        <SettingRow title="Language" caption="Interface language" onPress={go("stylesLanguage")} />
      </>
    ),
  },
  stylesGlobal: {
    title: "Global",
    body: () => (
      <>
        <OptionsRow label="Interface mode" k="theme" options={[["system", "As in the system"], ["light", "Light"], ["dark", "Dark"]]} />
        <SettingRow title="Color theme" caption="Color change for the entire application" onPress={go("stylesColor")} />
      </>
    ),
  },
  stylesColor: { title: "Color theme", body: () => <ColorTheme /> },
  stylesNavigation: {
    title: "Bottom navigation",
    body: () => <OptionsRow label="Element names" k="navLabels" options={[["always", "Always show"], ["active", "Show only for selected"], ["never", "Never show"]]} />,
  },
  stylesElements: {
    title: "Elements",
    body: () => (
      <>
        <SettingRow title="Operations list" caption="Elements on the operations list screen" onPress={go("elementsOperations")} />
        <SettingRow title="Statistics" caption="Elements on the statistics screen" onPress={() => sheets.open(<StatsSettings />, "sheet")} chevron={false} />
        <SettingRow title="Accounts" caption="Displaying accounts" onPress={go("elementsAccounts")} />
        <SettingRow title="Categories" caption="Displaying categories" onPress={go("elementsCategories")} />
        <SettingRow title="Keyboard" caption="Keyboard inside the application" onPress={go("elementsKeyboard")} />
      </>
    ),
  },
  stylesLanguage: { title: "Language", body: () => <Language /> },
  elementsOperations: { title: "Operations list screen", body: () => <Switch label="Opening and closing balance" k="opening" hint="Shows the opening and closing balance on the operations list screen." /> },
  elementsAccounts: { title: "Accounts", body: () => <Switch label="Large account rows" k="bigAccounts" /> },
  elementsCategories: {
    title: "Categories",
    body: () => (
      <>
        <Switch label="Categories in one column" k="oneColumn" hint="If enabled, categories are shown in a single column." />
        <Switch label="Category selection in one column" k="onePicker" hint="If enabled, the category selection sheet is shown in a single column." />
        <Switch label="Show subcategories" k="subcategories" />
      </>
    ),
  },
  elementsKeyboard: { title: "Keyboard", body: () => <Switch label="Reverse number order" k="reverseKeys" hint="If enabled, the numbers are arranged in reverse order as in a calculator. If it is turned off, in the usual way as on a regular keyboard." /> },
  notifications: { title: "Notifications", body: () => <Notifications /> },
  security: { title: "Security", body: () => <Security /> },
  privacy: { title: "Privacy", body: () => <Privacy /> },
  backups: { title: "Backups", body: () => <Backups /> },
};

export function SettingsPage() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const p = usePalette();
  const t = useT();
  const def = PAGES[page ?? ""];
  if (!def) return null;
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Stack.Screen options={{ title: t.t(def.title) }} />
      <ScrollView keyboardShouldPersistTaps="handled">{def.body()}</ScrollView>
    </View>
  );
}

const SECTIONS = [
  ["Formatting", "Main currency, currency format", "receipt", "formatting"],
  ["Styles and elements", "Colour, decorations and themes", "sun", "styles"],
  ["Backups", "Saving data to local backups", "archive", "backups"],
  ["Notifications", "Status, schedule", "bell", "notifications"],
  ["Security", "Protection of the application from outsiders", "lock", "security"],
  ["Privacy", "Hide values from outsiders", "shield", "privacy"],
] as const;

export function SettingsScreen() {
  const p = usePalette();
  const t = useT();
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Stack.Screen options={{ title: t.t("Settings") }} />
      <ScrollView>
        {SECTIONS.map(([label, caption, icon, page]) => (
          <SettingRow tall key={page} title={label} caption={caption} icon={icon} onPress={go(page)} />
        ))}
        <SettingRow tall title="Exchange rates" caption="Update and edit" icon="transfer" onPress={() => router.push("/rates")} />
      </ScrollView>
    </View>
  );
}
