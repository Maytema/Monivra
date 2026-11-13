// The root: opens the ledger, shows the first-start choice, and keeps scheduled payments and rates
// up to date while the application is open (at start, when it comes back, and every minute).
import { useEffect } from "react";
import { ActivityIndicator, KeyboardAvoidingView, AppState as SystemAppState, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { appStore, useAppState, usePalette, useT } from "../ui/app-context.tsx";
import { fetcher } from "../platform/network.ts";
import { probeEngine, watchStalls } from "../platform/perf.ts";
import { registerBackgroundPosting } from "../platform/background.ts";
import { rebuildReminders } from "../platform/notifications.ts";
import { askAboutMissed } from "../features/due-payments.tsx";
import { Recovery } from "../features/recovery.tsx";
import { setSecureScreen } from "../platform/native.ts";
import { Welcome } from "../features/welcome.tsx";
import { LockGate } from "../features/lock.tsx";
import { SheetHost } from "../ui/sheets.tsx";
import { NoticeHost, ToastHost } from "../ui/dialogs.tsx";

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
      clearInterval(timer);
      clearTimeout(probe);
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
      <LockGate>
      {/* The keyboard shortens the whole window, as adjustResize did in the first application: every
          page, sheet and dialog ends above it, and a scrolling page keeps its focused field in view. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
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
      </KeyboardAvoidingView>
      <NoticeHost />
      </LockGate>
      {/* Above the lock screen too: it says "Incorrect PIN" in a toast. */}
      <ToastHost />
    </>
  );
}

function Root() {
  const state = useAppState();
  if (state.status === "loading")
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  if (state.status === "failed") return <Recovery error={state.error} tooNew={state.tooNew} />;
  if (state.status === "welcome")
    return (
      <>
        <Welcome />
        <SheetHost />
      </>
    );
  return <Ready />;
}

export default function Layout() {
  // Only in the build made for the speed check: every long pause of the JavaScript thread is written down.
  useEffect(watchStalls, []);
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}
