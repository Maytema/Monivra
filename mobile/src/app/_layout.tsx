// The root: opens the ledger, shows the first-start choice, and keeps scheduled payments and rates
// up to date while the application is open (at start, when it comes back, and every minute).
import { useEffect } from "react";
import { ActivityIndicator, AppState as SystemAppState, Text, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { appStore, useAppState, usePalette, useT } from "../ui/app-context.tsx";
import { fetcher } from "../platform/network.ts";
import { Welcome } from "../features/welcome.tsx";

function KeepCurrent() {
  useEffect(() => {
    const store = appStore();
    const refresh = () => {
      store.postDueNow();
      void store.updateRates(fetcher).catch(() => undefined);
    };
    refresh();
    const timer = setInterval(() => store.postDueNow(), 60_000);
    const subscription = SystemAppState.addEventListener("change", (s) => s === "active" && refresh());
    return () => {
      clearInterval(timer);
      subscription.remove();
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
      </Stack>
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
