// The root: opens the ledger, shows the first-start choice, and keeps scheduled payments and rates
// up to date while the application is open (at start, when it comes back, and every minute).
import { useEffect } from "react";
import { ActivityIndicator, AppState as SystemAppState, Text, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { appStore, useAppState, usePalette, useT } from "../ui/app-context.tsx";
import { fetcher } from "../platform/network.ts";
import { registerBackgroundPosting } from "../platform/background.ts";
import { rebuildReminders } from "../platform/notifications.ts";
import { Welcome } from "../features/welcome.tsx";
import { LockGate } from "../features/lock.tsx";
import { SheetHost } from "../ui/sheets.tsx";

function KeepCurrent() {
  useEffect(() => {
    const store = appStore();
    const refresh = () => {
      store.postDueNow();
      void store.updateRates(fetcher).catch(() => undefined);
    };
    refresh();
    void registerBackgroundPosting();
    const timer = setInterval(() => store.postDueNow(), 60_000);
    const subscription = SystemAppState.addEventListener("change", (s) => s === "active" && refresh());
    // The system's reminders follow every change, once a burst of changes is over.
    let pending: ReturnType<typeof setTimeout> | null = null;
    let lastData: unknown = null;
    const plan = () => {
      const state = store.getState();
      if (state.status !== "ready" || state.data === lastData) return;
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
  return (
    <>
      <StatusBar style={p.dark ? "light" : "dark"} />
      <KeepCurrent />
      <LockGate>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: p.bg },
          headerTintColor: p.ink,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: p.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="operation" options={{ title: t.t("Operation"), presentation: "modal" }} />
        <Stack.Screen name="account" options={{ title: t.t("Account") }} />
        <Stack.Screen name="category" options={{ title: t.t("Category") }} />
        <Stack.Screen name="scheduled" options={{ title: t.t("Scheduled payments") }} />
        <Stack.Screen name="budgets" options={{ title: t.t("Budgets") }} />
        <Stack.Screen name="rates" options={{ title: t.t("Exchange rates") }} />
        <Stack.Screen name="data" options={{ title: t.t("Data") }} />
        <Stack.Screen name="settings" options={{ title: t.t("Settings") }} />
        <Stack.Screen name="filtered" options={{ title: t.t("Operations") }} />
      </Stack>
      <SheetHost />
      </LockGate>
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
  if (state.status === "failed")
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ fontSize: 18, textAlign: "center" }}>The data could not be opened. Nothing was changed.</Text>
        <Text style={{ marginTop: 12, color: "#6f6873", textAlign: "center" }}>{state.error}</Text>
      </View>
    );
  if (state.status === "welcome") return <Welcome />;
  return <Ready />;
}

export default function Layout() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}
