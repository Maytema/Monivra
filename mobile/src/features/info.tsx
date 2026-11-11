// The information pages of the More menu (js/screens/more/info-pages.js, support.js): instructions with their
// guides, support topics, about, privacy and terms. Texts that spoke of a browser say "device" here.
import type { ReactNode } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { APP_VERSION } from "../application/store.ts";
import { useCommand, usePalette, useT } from "../ui/app-context.tsx";
import { toast } from "../ui/dialogs.tsx";
import { Button, Icon } from "../ui/kit.tsx";
import { Footnote, SettingRow } from "../ui/rows.tsx";
import { GUIDES } from "./guides.ts";

const SUPPORT: Record<string, { title: string; text: readonly string[]; instructions?: boolean }> = {
  bugReport: { title: "Report a bug", text: ["Please describe the problem in as much detail as possible. What steps do you take before the problem occurs? What results do you get and what do you expect?", "Please attach screenshots or screen recordings to your message that demonstrate the issue. This will greatly help us understand and resolve the issue faster."] },
  featureRequest: { title: "Request a feature", text: ["Please describe your idea in as much detail as possible so that we can understand it better.", "Attach sketches, examples, or any materials that could visually explain what exactly you want to see.", "If mathematical calculations are required, please attach information or sources that will help us better understand these calculations."] },
  usageQuestion: { title: "Question on how to use", instructions: true, text: ["Before asking a question, please read the instructions explaining various aspects of using the app.", "If you still have questions after reading, please write to us."] },
  otherSupport: { title: "Other", text: ["Write anything, in any volume. We will definitely read everything you send, regardless of the length of the letter!"] },
};

const page = (kind: string) => () => router.push({ pathname: "/info", params: { kind } });

function Heading({ children }: { children: string }) {
  const p = usePalette();
  const t = useT();
  return <Text style={{ color: p.ink, fontSize: 17, fontWeight: "600", paddingTop: 14, paddingBottom: 6 }}>{t.t(children)}</Text>;
}
function Para({ children }: { children: string }) {
  const p = usePalette();
  const t = useT();
  return <Text style={{ color: p.inkSoft, fontSize: 15, lineHeight: 22, paddingBottom: 8 }}>{t.t(children)}</Text>;
}
const Body = ({ children }: { children: ReactNode }) => <View style={{ padding: 18 }}>{children}</View>;

function Instructions() {
  const t = useT();
  const run = useCommand();
  return (
    <>
      <View style={{ paddingHorizontal: 18, paddingTop: 14 }}>
        <Text style={{ fontSize: 16 }}>{t.t("Learn the basics of {app}", { app: "Monivra" })}</Text>
      </View>
      <SettingRow title="Repeat hints" caption="Restart tooltips throughout the application" chevron={false} onPress={() => (run((tx) => (tx.setSettings({ dismissedHints: [] }), true)), toast("Hints will be shown again"))} />
      {GUIDES.map((g) => (
        <SettingRow key={g.id} title={g.title} caption={g.about} onPress={page("guide:" + g.id)} />
      ))}
    </>
  );
}

function Support() {
  return (
    <>
      {Object.entries(SUPPORT).map(([key, topic]) => (
        <SettingRow key={key} title={topic.title} icon="help" onPress={page(key)} />
      ))}
    </>
  );
}

function SupportTopic({ topic }: { topic: (typeof SUPPORT)[string] }) {
  const t = useT();
  return (
    <Body>
      {topic.text.map((x) => (
        <Para key={x}>{x}</Para>
      ))}
      {topic.instructions ? <Button label="View instructions" kind="outline" onPress={page("instructions")} /> : null}
      <Para>You will be redirected to the email sending application.</Para>
      <Para>A correctly completed letter will help process your request faster.</Para>
      <Button label="Continue" onPress={() => void Linking.openURL(`mailto:?subject=${encodeURIComponent(t.t(topic.title))}`)} />
    </Body>
  );
}

function About() {
  const p = usePalette();
  const t = useT();
  return (
    <Body>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 14 }}>
        <Icon name="pin" size={22} color={p.accentInk} />
        <Text style={{ color: p.ink, fontSize: 16 }}>{t.t("Bishkek, Kyrgyzstan")}</Text>
      </View>
      <Para>{t.t("The {app} team works every day to build a convenient and useful application for managing your finances.", { app: "Monivra" })}</Para>
      <Para>We hope our work will help you manage your money better and reach your goals!</Para>
    </Body>
  );
}

function Policy() {
  return (
    <Body>
      <Heading>Privacy in the current beta</Heading>
      <Para>The application stores accounts, categories and operations on this device only, in its own protected storage. Nothing is sent to a server; there are no accounts, no analytics and no advertising.</Para>
      <Heading>Exchange rates</Heading>
      <Para>When automatic rates are on, the application asks free public rate sources for currency rates. These requests contain no data of yours, only the request for rates.</Para>
      <Heading>Export and deletion</Heading>
      <Para>You can save a data file under More → Data. Files you have already saved must be deleted separately. Removing the application removes its data.</Para>
      <Footnote>This is a technical summary of the beta, not a finalized privacy policy.</Footnote>
    </Body>
  );
}

function Terms() {
  return (
    <Body>
      <Heading>Closed beta information</Heading>
      <Para>Monivra is currently an unfinished testing build. Features, appearance and stored-data formats may change during development.</Para>
      <Heading>Financial information</Heading>
      <Para>This tool is intended for personal expense tracking. It is not a banking service and does not execute real transfers.</Para>
      <Heading>Data safety</Heading>
      <Para>Keep your own backup before clearing application data or moving to another device.</Para>
      <Footnote>These notes are not a binding user agreement.</Footnote>
    </Body>
  );
}

function Soon({ title }: { title: string }) {
  const p = usePalette();
  const t = useT();
  return (
    <View style={{ alignItems: "center", gap: 12, padding: 32 }}>
      <Icon name="user" size={64} color={p.accentInk} />
      <Text style={{ color: p.ink, fontSize: 18 }}>{t.t(title)}</Text>
      <Text style={{ color: p.muted, textAlign: "center" }}>{t.t("Coming soon")}</Text>
    </View>
  );
}

function resolve(kind: string): { title: string; body: ReactNode } | null {
  if (kind.startsWith("guide:")) {
    const g = GUIDES.find((x) => x.id === kind.slice(6));
    return g ? { title: g.title, body: <Body>{g.sections.map(([h, text]) => <View key={h}><Heading>{h}</Heading><Para>{text}</Para></View>)}</Body> } : null;
  }
  const topic = SUPPORT[kind];
  if (topic) return { title: topic.title, body: <SupportTopic topic={topic} /> };
  switch (kind) {
    case "instructions": return { title: "Instructions", body: <Instructions /> };
    case "support": return { title: "Support", body: <Support /> };
    case "about": return { title: "About our team", body: <About /> };
    case "privacyPolicy": return { title: "Privacy policy", body: <Policy /> };
    case "terms": return { title: "Terms of use", body: <Terms /> };
    case "profile": return { title: "Profile", body: <Soon title="Profile" /> };
    case "subscription": return { title: "Subscription", body: <Soon title="Subscription" /> };
    default: return null;
  }
}

export function InfoPage() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  const p = usePalette();
  const t = useT();
  const found = resolve(kind ?? "");
  if (!found) return null;
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Stack.Screen options={{ title: t.t(found.title) }} />
      <ScrollView>{found.body}</ScrollView>
    </View>
  );
}

export const appVersionLine = (closedBeta: string): string => `Monivra · ${APP_VERSION} (${closedBeta}) · React Native`;
