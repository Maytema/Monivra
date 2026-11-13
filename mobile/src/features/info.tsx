// The information pages of the More menu (js/screens/more/info-pages.js, support.js): instructions with their
// guides, support topics, about, privacy and terms. Texts that spoke of a browser say "device" here.
import { useState, type ReactNode } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable } from "../ui/pressable.tsx";
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { APP_VERSION } from "../application/store.ts";
import { useCommand, usePalette, useT } from "../ui/app-context.tsx";
import { showInfo, toast } from "../ui/dialogs.tsx";
import { mix } from "../ui/theme.ts";
import { Button, Icon } from "../ui/kit.tsx";
import { Footnote, SettingRow } from "../ui/rows.tsx";
import { GUIDES } from "./guides.ts";

const SUPPORT: Record<string, { title: string; icon: string; text: readonly string[]; instructions?: boolean }> = {
  refund: { title: "Request a refund", icon: "calendarX", text: ["Please write the date of the purchase and the store where it was made, so that we can find it.", "Write anything else you consider important. We will definitely read everything you send."] },
  bugReport: { title: "Report a bug", icon: "alertCircle", text: ["Please describe the problem in as much detail as possible. What steps do you take before the problem occurs? What results do you get and what do you expect?", "Please attach screenshots or screen recordings to your message that demonstrate the issue. This will greatly help us understand and resolve the issue faster."] },
  featureRequest: { title: "Request a feature", icon: "note", text: ["Please describe your idea in as much detail as possible so that we can understand it better.", "Attach sketches, examples, or any materials that could visually explain what exactly you want to see.", "If mathematical calculations are required, please attach information or sources that will help us better understand these calculations."] },
  usageQuestion: { title: "Question on how to use", icon: "helpScan", instructions: true, text: ["Before asking a question, please read the instructions explaining various aspects of using the app.", "If you still have questions after reading, please write to us."] },
  otherSupport: { title: "Other", icon: "lines", text: ["Write anything, in any volume. We will definitely read everything you send, regardless of the length of the letter!"] },
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

// The topics of support (as on the owner's screen of the reference): an icon, the topic, an arrow,
// thin lines between the rows.
function Support() {
  const p = usePalette();
  const t = useT();
  const topics = Object.entries(SUPPORT);
  return (
    <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
      {topics.map(([key, topic], i) => (
        <Pressable key={key} accessibilityRole="button" onPress={page(key)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 26, minHeight: 73, borderTopWidth: i ? 1 : 0, borderTopColor: p.line, backgroundColor: pressed ? p.soft : "transparent" })}>
          <Icon name={topic.icon} size={26} color={p.ink} />
          <Text style={{ flex: 1, color: p.ink, fontSize: 18 }}>{t.t(topic.title)}</Text>
          <Icon name="right" size={20} color={p.accentInk} />
        </Pressable>
      ))}
    </View>
  );
}

// A support topic (js/screens/more/support.js `supportTopicPage`): the text, under a line what will happen, and
// the button that stays at the bottom.
function SupportTopic({ topic }: { topic: (typeof SUPPORT)[string] }) {
  const t = useT();
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const note = { color: p.inkSoft, fontSize: 13, lineHeight: 20, paddingBottom: 8 } as const;
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 12 }}>
        {topic.text.map((x) => (
          <Para key={x}>{x}</Para>
        ))}
        {topic.instructions ? <Button label="View instructions" kind="outline" onPress={page("instructions")} /> : null}
        <View style={{ marginTop: 12, paddingTop: 16, borderTopWidth: 1, borderTopColor: p.line }}>
          <Text style={note}>{t.t("You will be redirected to the email sending application.")}</Text>
          <Text style={note}>{t.t("A correctly completed letter will help process your request faster.")}</Text>
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12) + 4 }}>
        <Button label="Continue" onPress={() => void Linking.openURL(`mailto:?subject=${encodeURIComponent(t.t(topic.title))}`)} />
      </View>
    </View>
  );
}

// The picture of the About page (js/screens/about-art.js): the top of a phone with the main screen that
// runs off the bottom and fades into the page; the new expense is already in the list, small shapes beside.
function AboutArt() {
  const p = usePalette();
  const rows = [0, 1, 2, 3].map((i) => 146 + i * 34);
  const slices: [number, number, string][] = [[46, 0, p.accent], [26, 48, p.positive], [14, 76, p.negative]];
  const C = 2 * Math.PI * 24;
  return (
    <Svg width="100%" viewBox="0 0 320 252" style={{ maxWidth: 400, alignSelf: "center", aspectRatio: 320 / 252 }}>
      <Rect x={70} y={24} width={180} height={330} rx={30} fill={p.sheet} stroke={p.accent} strokeWidth={2.5} />
      <Rect x={140} y={34} width={40} height={5} rx={2.5} fill={p.line} />
      <Rect x={84} y={52} width={152} height={76} rx={16} fill={p.soft} />
      <Rect x={98} y={68} width={44} height={5} rx={2.5} fill={p.muted} opacity={0.55} />
      <Rect x={98} y={82} width={70} height={11} rx={5.5} fill={p.accent} />
      <Rect x={98} y={104} width={30} height={5} rx={2.5} fill={p.muted} opacity={0.55} />
      <Rect x={134} y={104} width={22} height={5} rx={2.5} fill={p.muted} opacity={0.55} />
      <G rotation={-90} origin="204, 90">
        <Circle cx={204} cy={90} r={24} stroke={p.sheet} strokeWidth={9} fill="none" />
        {slices.map(([len, start, color]) => (
          <Circle key={start} cx={204} cy={90} r={24} stroke={color} strokeWidth={9} fill="none" strokeDasharray={`${(len / 100) * C} ${C}`} strokeDashoffset={-(start / 100) * C} />
        ))}
      </G>
      {rows.map((y, i) => (
        <G key={y}>
          <Rect x={84} y={y} width={152} height={28} rx={10} fill={p.bg} stroke={p.line} strokeWidth={1} />
          <Circle cx={100} cy={y + 14} r={9} fill={i === 0 ? p.negative : p.tint} />
          {i === 0 ? <Path d={`M95 ${y + 14}h10`} stroke="#ffffff" strokeWidth={3} strokeLinecap="round" /> : null}
          <Rect x={116} y={y + 7} width={54} height={5} rx={2.5} fill={p.muted} opacity={0.55} />
          <Rect x={116} y={y + 16} width={30} height={4} rx={2} fill={p.line} />
          <Rect x={196} y={y + 11} width={30} height={6} rx={3} fill={p.negative} />
        </G>
      ))}
      <Defs>
        <LinearGradient id="aboutFade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={p.bg} stopOpacity={0} />
          <Stop offset="1" stopColor={p.bg} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={164} width={320} height={88} fill="url(#aboutFade)" />
      <Circle cx={34} cy={70} r={5} fill={p.tint} />
      <Circle cx={286} cy={108} r={4} fill={mix(p.accent, p.bg, 0.4)} />
      <Circle cx={42} cy={176} r={3.5} fill={mix(p.positive, p.bg, 0.5)} />
    </Svg>
  );
}

function About() {
  const p = usePalette();
  const t = useT();
  return (
    <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 22, paddingTop: 8, paddingBottom: 32 }}>
      <AboutArt />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12, marginBottom: 26 }}>
        <Icon name="pin" size={22} color={p.accentInk} />
        <Text style={{ color: p.ink, fontSize: 18 }}>{t.t("Bishkek, Kyrgyzstan")}</Text>
      </View>
      <Text style={{ color: p.inkSoft, fontSize: 16, lineHeight: 24, textAlign: "center", marginBottom: 14 }}>{t.t("The {app} team works every day to make the app convenient and useful for you.", { app: "Monivra" })}</Text>
      <Text style={{ color: p.inkSoft, fontSize: 16, lineHeight: 24, textAlign: "center" }}>{t.t("We hope our work will help you manage your money better and reach your goals!")}</Text>
    </View>
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

// The label of pages of features that do not exist yet (js/screens/more/info-pages.js `soon`).
function SoonPill() {
  const p = usePalette();
  const t = useT();
  return <Text style={{ alignSelf: "flex-start", backgroundColor: mix(p.accent, p.bg, 0.12), color: p.accentInk, paddingVertical: 5, paddingHorizontal: 12, borderRadius: 18, overflow: "hidden", fontSize: 12 }}>{t.t("Coming soon")}</Text>;
}

// Shared access (info-pages.js `sharedAccessPage`).
function Shared() {
  const p = usePalette();
  const t = useT();
  return (
    <View style={{ alignItems: "center", gap: 14, paddingTop: 50, paddingBottom: 20, paddingHorizontal: 24 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <SoonPill />
        <Icon name="user" size={64} color={p.accentInk} />
      </View>
      <Text style={{ color: p.ink, fontSize: 15, textAlign: "center" }}>{t.t("Shared access will be available after sign-in is added.")}</Text>
    </View>
  );
}

// The profile (info-pages.js `profilePage`): the orbit picture, the state of the local data, two actions.
function Profile() {
  const p = usePalette();
  const t = useT();
  const rows: [string, string][] = [
    ["Sync status", "Local data · not synced"],
    ["User ID", "Not connected"],
    ["Signed in via", "Not signed in"],
    ["Subscription status", "Closed beta"],
  ];
  const action = (label: string, text: string, danger = false) => (
    <Pressable key={label} accessibilityRole="button" onPress={() => showInfo(text)} style={({ pressed }) => ({ minHeight: 47, borderRadius: 28, borderWidth: 1, borderColor: p.line, alignItems: "center", justifyContent: "center", marginVertical: 12, backgroundColor: pressed ? p.soft : "transparent" })}>
      <Text style={{ color: danger ? p.negativeInk : p.ink, fontSize: 14 }}>{t.t(label)}</Text>
    </Pressable>
  );
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 25 }}>
      <SoonPill />
      <View style={{ height: 190, alignItems: "center", justifyContent: "center", marginTop: 2, marginBottom: 8 }}>
        <Svg width={160} height={160} viewBox="0 0 200 200">
          <Circle cx={100} cy={100} r={80} fill="none" stroke="#72a6aa" strokeWidth={1.4} />
          <Circle cx={100} cy={100} r={71} fill="none" stroke="#72a6aa" strokeWidth={1} />
          <Circle cx={100} cy={100} r={87} fill="none" stroke="#72a6aa" strokeWidth={1} strokeDasharray="75 18 40 22 14 30" />
          <G fill="none" stroke="#488c94" strokeWidth={2.5} strokeLinecap="round">
            <Circle cx={100} cy={92} r={10} />
            <Path d="M86 118v-8c0-11 28-11 28 0v8" />
          </G>
          <G fill="#5c989f">
            <Circle cx={23} cy={101} r={3} />
            <Circle cx={176} cy={93} r={3} />
            <Circle cx={100} cy={12} r={3} />
            <Circle cx={150} cy={30} r={1.8} />
            <Circle cx={44} cy={164} r={2} />
          </G>
          <G fill="#8bbcc1">
            <Circle cx={100} cy={188} r={2.2} />
            <Circle cx={31} cy={52} r={1.6} />
            <Circle cx={182} cy={140} r={1.8} />
          </G>
        </Svg>
      </View>
      <View style={{ paddingBottom: 12 }}>
        {rows.map(([label, value], i) => (
          <View key={label}>
            <Text style={{ color: p.muted, fontSize: 12, marginTop: 16, marginBottom: 6 }}>{t.t(label)}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
              {i === 0 ? <Icon name="cloud" size={17} color={p.positive} /> : null}
              <Text style={{ color: p.ink, fontSize: 15, lineHeight: 20 }}>{t.t(value)}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={{ marginTop: "auto", paddingTop: 30 }}>
        {action("Sign out", "This offline beta is not connected to an account.")}
        {action("Delete account", "No remote account exists. You can manage local data under More → Data.", true)}
      </View>
    </ScrollView>
  );
}

const PLANS = [
  { key: "Lifetime", name: "Lifetime access", price: "$19.00", detail: "One time payment", note: "All future features are included at no additional cost", tag: "" },
  { key: "Annually", name: "Annually", price: "$12.00", detail: "(Approx. $0.23 per week)", note: "", tag: "Beta offer" },
  { key: "Monthly", name: "Monthly", price: "$1.50", detail: "(Approx. $0.35 per week)", note: "", tag: "" },
] as const;
const FEATURES = [
  "Synchronization of devices in real time via a shared account",
  "Any number of accounts, debts and goals",
  "Any number of expense and income categories",
  "Any number of budgets",
  "Any number of scheduled and recurring payments",
  "Export and import of data",
  "Backup and restore data",
  "No ads",
];

// The subscription page (info-pages.js `subscriptionPage`): plans to pick, what they give, the store's
// actions and, pinned under the page, Continue. Nothing can be bought yet; every action says so.
function Subscription() {
  const p = usePalette();
  const t = useT();
  const [plan, setPlan] = useState<string>("Lifetime");
  const notYet = () => showInfo("Store billing is not connected yet.");
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingTop: 14, paddingHorizontal: 20, paddingBottom: 24 }}>
        <SoonPill />
        <Text style={{ color: p.ink, fontSize: 19, lineHeight: 24, textAlign: "center", marginVertical: 12 }}>{t.t("Use the full potential of the application!")}</Text>
        <View style={{ gap: 10, paddingHorizontal: 8, paddingTop: 8, marginBottom: 13 }}>
          {PLANS.map((x, i) => {
            const on = plan === x.key;
            return (
              <Pressable key={x.key} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setPlan(x.key)} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, minHeight: i ? 80 : 108, borderRadius: 11, borderWidth: on ? 2 : 1, borderColor: on ? p.accent : p.line, backgroundColor: p.key, paddingVertical: on ? 14 : 15, paddingHorizontal: on ? 12 : 13, elevation: 1 }}>
                <View style={{ flex: 1, gap: 5 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ color: p.ink, fontSize: 14, fontWeight: "600" }}>{t.t(x.name)}</Text>
                    {x.tag ? <Text style={{ backgroundColor: p.positive, color: "#ffffff", fontSize: 10, paddingVertical: 3, paddingHorizontal: 6, borderRadius: 9, overflow: "hidden" }}>{t.t(x.tag)}</Text> : null}
                  </View>
                  <Text style={{ color: p.muted, fontSize: 12, lineHeight: 16 }}>{t.t(x.detail)}</Text>
                  {x.note ? <Text style={{ color: p.muted, fontSize: 12, lineHeight: 16, maxWidth: 235 }}>{t.t(x.note)}</Text> : null}
                </View>
                <Text style={{ color: p.ink, fontSize: 14, marginTop: 4 }}>{x.price}</Text>
                {on ? (
                  <View style={{ position: "absolute", right: -9, top: -9, width: 22, height: 22, borderRadius: 11, backgroundColor: p.accent, alignItems: "center", justifyContent: "center" }}>
                    <Icon name="check" size={13} color={p.onAccent} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <View style={{ gap: 14, marginVertical: 17, paddingHorizontal: 4 }}>
          {FEATURES.map((x) => (
            <View key={x} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
              <Icon name="check" size={17} color={p.accentInk} />
              <Text style={{ flex: 1, color: p.ink, fontSize: 12, lineHeight: 17 }}>{t.t(x)}</Text>
            </View>
          ))}
        </View>
        <View style={{ gap: 8 }}>
          {["Solving the payment problem", "Check purchase status", "Restore purchases", "Subscription management"].map((x) => (
            <Pressable key={x} accessibilityRole="button" onPress={notYet} style={({ pressed }) => ({ borderWidth: 1, borderColor: p.line, borderRadius: 40, paddingVertical: 10, paddingHorizontal: 16, alignItems: "center", backgroundColor: pressed ? p.soft : "transparent" })}>
              <Text style={{ color: p.ink, fontSize: 14, lineHeight: 18 }}>{t.t(x)}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={{ color: p.muted, fontSize: 11, lineHeight: 16, marginTop: 17 }}>{t.t("Prices are indicative and payments are not available yet. Plans and prices may change before launch.")}</Text>
      </ScrollView>
      <View style={{ paddingTop: 11, paddingHorizontal: 21, paddingBottom: 15, borderTopWidth: 1, borderTopColor: p.line, backgroundColor: p.bg }}>
        <Button label="Continue" onPress={() => showInfo("Subscriptions are not available yet.")} />
      </View>
    </View>
  );
}

// `own`: the page scrolls by itself (and may pin something under it).
function resolve(kind: string): { title: string; body: ReactNode; own?: boolean } | null {
  if (kind.startsWith("guide:")) {
    const g = GUIDES.find((x) => x.id === kind.slice(6));
    return g ? { title: g.title, body: <Body>{g.sections.map(([h, text]) => <View key={h}><Heading>{h}</Heading><Para>{text}</Para></View>)}</Body> } : null;
  }
  const topic = SUPPORT[kind];
  if (topic) return { title: topic.title, body: <SupportTopic topic={topic} />, own: true };
  switch (kind) {
    case "instructions": return { title: "Instructions", body: <Instructions /> };
    case "support": return { title: "Support", body: <Support /> };
    case "about": return { title: "About our team", body: <About /> };
    case "privacyPolicy": return { title: "Privacy policy", body: <Policy /> };
    case "terms": return { title: "Terms of use", body: <Terms /> };
    case "profile": return { title: "Profile", body: <Profile />, own: true };
    case "shared": return { title: "Shared access", body: <Shared /> };
    case "subscription": return { title: "Subscription", body: <Subscription />, own: true };
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
      {found.own ? found.body : <ScrollView contentContainerStyle={{ flexGrow: 1 }}>{found.body}</ScrollView>}
    </View>
  );
}

export const appVersionLine = (closedBeta: string): string => `Monivra · ${APP_VERSION} (${closedBeta}) · React Native`;
