// More: budgets, scheduled payments, exchange rates, data, settings; and those pages.
import { Fragment } from "react";
import { Text, View } from "react-native";
import { Pressable } from "../ui/pressable.tsx";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { APP_VERSION } from "../application/store.ts";
import { usePalette, useT } from "../ui/app-context.tsx";
import { HintBanner } from "../ui/hint-banner.tsx";
import { Icon, Screen } from "../ui/kit.tsx";
import { BrandMark } from "../ui/brand-mark.tsx";

// The groups of the menu (js/screens/more/menu.js). Pages that are not built yet are not listed.
const GROUPS = [
  [
    ["Subscription", "star", "subscription"],
    ["Profile", "user", "profile"],
  ],
  [
    ["Scheduled payments", "calendar", "/scheduled"],
    ["Budgets", "budget", "/budgets"],
  ],
  [
    ["Settings", "gear", "/settings"],
    ["Data", "receipt", "/data"],
  ],
  [
    ["Instructions", "play", "instructions"],
    ["Support", "help", "support"],
    ["About our team", "info", "about"],
    ["Privacy policy", "shield", "privacyPolicy"],
    ["Terms of use", "receipt", "terms"],
  ],
] as const;

export function MoreScreen() {
  const t = useT();
  const p = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: p.bg }}>
      <Screen padded={false}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, height: 59, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: p.line }}>
          <View style={p.dark ? { backgroundColor: "#ffffff", borderRadius: 10, paddingVertical: 3, paddingHorizontal: 4 } : undefined}>
            <BrandMark height={38} />
          </View>
          <Text numberOfLines={1} style={{ flexShrink: 1, color: p.ink, fontSize: 29, fontWeight: "600" }}>
            Monivra
          </Text>
          <View style={{ backgroundColor: "#000000", borderRadius: 9, paddingTop: 3, paddingBottom: 4, paddingHorizontal: 10 }}>
            <Text style={{ color: "#ffffff", fontSize: 18, fontWeight: "500" }}>{t.t("Premium")}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 15, height: 41, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: p.line }}>
          <Icon name="cloud" size={23} color={p.positive} />
          <Text style={{ color: p.muted, fontSize: 14 }}>{t.t("Local data · Closed Beta")}</Text>
        </View>
        {GROUPS.map((group, i) => (
          <Fragment key={i}>
          <View style={{ paddingVertical: 9, borderBottomWidth: i === GROUPS.length - 1 ? 0 : 1, borderBottomColor: p.line }}>
            {group.map(([label, icon, href]) => (
              <Pressable key={href} accessibilityRole="button" onPress={() => (href.startsWith("/") ? router.push(href as "/settings") : router.push({ pathname: "/info", params: { kind: href } }))} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 18, height: 56, paddingHorizontal: 18, backgroundColor: pressed ? p.sheet : "transparent" })}>
                <Icon name={icon} size={24} color={p.ink} />
                <Text style={{ color: p.ink, fontSize: 17 }}>{t.t(label)}</Text>
              </Pressable>
            ))}
          </View>
            {i === 0 ? <HintBanner plain id="shared-access" text="Shared access" onPress={() => router.push({ pathname: "/info", params: { kind: "shared" } })} /> : null}
          </Fragment>
        ))}
        <Text style={{ color: p.muted, fontSize: 14, textAlign: "center", paddingTop: 22, paddingBottom: 24 }}>{`Monivra · ${APP_VERSION} (${t.t("Closed Beta")}) · React Native`}</Text>
      </Screen>
    </View>
  );
}
