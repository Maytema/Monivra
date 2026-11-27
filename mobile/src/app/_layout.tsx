// The root: opens the ledger, shows the first-start choice, and keeps scheduled payments and rates
// up to date while the application is open (at start, when it comes back, and every minute).
import { useEffect } from "react";
import { ActivityIndicator, AppState as SystemAppState, View } from "react-native";
import { dismissKeyboard, KeyboardPad } from "../ui/keyboard.tsx";
import { Stack, usePathname } from "expo-router";
import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { enableFreeze } from "react-native-screens";
import { setAppVersion } from "../application/store.ts";
import { probeEngine, watchStalls } from "../platform/perf.ts";
import { appStore, LedgerLook, useAppPhase, usePalette, useT } from "../ui/app-context.tsx";
import { fetcher } from "../platform/network.ts";
import { registerBackgroundPosting } from "../platform/background.ts";
import { rebuildReminders } from "../platform/notifications.ts";
import { askAboutMissed } from "../features/due-payments.tsx";
import { Recovery } from "../features/recovery.tsx";
import { setSecureScreen } from "../platform/native.ts";
import { Welcome } from "../features/welcome.tsx";
import { LockGate } from "../features/lock.tsx";
import { SheetHost } from "../ui/sheets.tsx";
import { NotificationAsk } from "../features/notification-ask.tsx";
import { CoachHost } from "../ui/coach.tsx";
import { NoticeHost, ToastHost } from "../ui/dialogs.tsx";

setAppVersion(Constants.expoConfig?.version ?? "0.0.0");

function KeepCurrent() {
  useEffect(() => {
    const store = appStore();
    const refresh = () => {
      store.postDueNow();
      // The daily copy when "Save locally" is on (js/app/startup.js).
      try {
        store.dailyBackup();
      } catch (error) {
        console.error(error);
      }
      askAboutMissed();
      void store.updateRates(fetcher).catch(() => undefined);
    };
    refresh();
    void registerBackgroundPosting();
    const probe = setTimeout(probeEngine, 5000);
    const timer = setInterval(() => (store.postDueNow(), askAboutMissed()), 60_000);
    const subscription = SystemAppState.addEventListener("change", (s) => s === "active" && refresh());
    // The system's reminders follow every change, once a burst of changes is over.
    let pending: ReturnType<typeof setTimeout> | null = null;
    let lastData: unknown = null;
    const plan = () => {
      const state = store.getState();
      if (state.status !== "ready" || state.data === lastData) return;
      setSecureScreen(!!state.data.settings.hidePreview);
      lastData = state.data;
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        const now = store.getState();
        if (now.status === "ready") void rebuildReminders(now.data, store.env.clock.today(), store.env.clock.time());
      }, 1500);
    };
    plan();
    const unsubscribe = store.subscribe(plan);
    return () => {
      clearTimeout(probe);
      clearInterval(timer);
      subscription.remove();
      unsubscribe();
      if (pending) clearTimeout(pending);
    };
  }, []);
  return null;
}

function Ready() {
  const p = usePalette();
  const t = useT();
  const insets = useSafeAreaInsets();
  return (
    <>
      <StatusBar style={p.dark ? "light" : "dark"} />
      <KeepCurrent />
      <KeyboardFollowsPage />
      <LockGate>
      {/* The keyboard shortens the whole window, as adjustResize did in the first application: every
          page, sheet and dialog ends above it, and a scrolling page keeps its focused field in view. */}
      <KeyboardPad>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: p.bg },
          headerTintColor: p.ink,
          headerShadowVisible: false,
          headerTitleAlign: "center",
          headerTitleStyle: { fontSize: 22, fontWeight: "400", color: p.ink },
          // Every page of the stack ends above the system bar; the tabs carry the inset in their bar.
          contentStyle: { backgroundColor: p.bg, paddingBottom: insets.bottom },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, contentStyle: { backgroundColor: p.bg, paddingBottom: 0 } }} />
        <Stack.Screen name="account" options={{ title: t.t("Account") }} />
        <Stack.Screen name="category" options={{ title: t.t("Category") }} />
        <Stack.Screen name="categories-manage" options={{ title: t.t("Change categories") }} />
        <Stack.Screen name="scheduled" options={{ title: t.t("Scheduled payments") }} />
        <Stack.Screen name="budgets" options={{ title: t.t("Budgets") }} />
        <Stack.Screen name="budget" options={{ title: t.t("Budget") }} />
        <Stack.Screen name="budget-details" options={{ title: t.t("Budget") }} />
        <Stack.Screen name="rates" options={{ title: t.t("Exchange rates") }} />
        <Stack.Screen name="data" options={{ title: t.t("Data") }} />
        <Stack.Screen name="info" options={{ title: "" }} />
        <Stack.Screen name="settings" options={{ title: t.t("Settings") }} />
        <Stack.Screen name="settings-page" options={{ title: t.t("Settings") }} />
        <Stack.Screen name="filtered" options={{ title: t.t("Filtered") }} />
      </Stack>
      <SheetHost />
      <CoachHost />
      <NotificationAsk />
      </KeyboardPad>
      <NoticeHost />
      </LockGate>
      {/* Above the lock screen too: it says "Incorrect PIN" in a toast. */}
      <ToastHost />
    </>
  );
}

function Root() {
  const state = useAppPhase();
  if (state.status === "loading")
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  if (state.status === "failed") return <Recovery error={state.error} tooNew={state.tooNew} />;
  // LedgerLook gives the colours, the language and the money format to everything drawn inside.
  if (state.status === "welcome")
    return (
      <LedgerLook>
        <Welcome />
        <SheetHost />
      </LedgerLook>
    );
  return (
    <LedgerLook>
      <Ready />
    </LedgerLook>
  );
}

// A tab that is not shown is frozen (app/(tabs)/_layout.tsx, freezeOnBlur). The switch is turned on here, not left to the default:
// in the speed check (build 161) every tap on the eye of the balance drew the Operations tab (5 pages, their rows and icons, ~150 ms)
// while Statistics, Categories or Accounts was in front.
enableFreeze(true);

export default function Layout() {
  // Speed-check lab only: every long pause of the JavaScript thread is written down.
  useEffect(watchStalls, []);
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}

// A new page or another tab: the field that was being typed in is not on the screen any more, the keyboard goes
// (ui/keyboard.tsx). A page that is opened to type in focuses its own field after this.
function KeyboardFollowsPage() {
  const path = usePathname();
  useEffect(() => dismissKeyboard(), [path]);
  return null;
}
