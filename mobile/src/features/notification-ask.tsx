// The question about notifications (the owner, 2026-11-22): not at the very start but a while after it, a window with
// a bell that shakes now and then. "Allow" asks the system and, when it allows, turns on a reminder every day at 8 pm
// (the time and the frequency are changed in the settings, where it can also be turned off); "Later" asks again in a
// few days. Nothing is asked of a person who has already allowed or blocked notifications.
import { useEffect, useRef } from "react";
import { Animated, Easing, Text, View } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { notificationsAllowed, notificationState } from "../platform/notifications.ts";
import { readAnswer, writeAnswer } from "../platform/notification-ask.ts";
import { useCommand, useLedger, usePalette, useT } from "../ui/app-context.tsx";
import { Button } from "../ui/kit.tsx";
import { Pivot } from "../ui/svg-pivot.tsx";
import { sheets, useCloseLayer } from "../ui/sheets.tsx";

const AFTER_START_MS = 25_000;
const AGAIN_AFTER_MS = 3 * 24 * 3600 * 1000;
const AnimatedG = Animated.createAnimatedComponent(G);

// A bell with a face, hung by its top: it is jerked twice quickly, the swing dying down (about 14°, 10°, 5°, 2°) within
// two thirds of a second, rests a while, and again.
function Bell() {
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const shake = (to: number, ms: number) => Animated.timing(turn, { toValue: to, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: false });
    const loop = Animated.loop(Animated.sequence([Animated.delay(1000), shake(1, 90), shake(-0.72, 120), shake(0.36, 110), shake(-0.15, 100), shake(0, 90), Animated.delay(2200)]));
    loop.start();
    return () => loop.stop();
  }, [turn]);
  const angle = turn.interpolate({ inputRange: [-1, 1], outputRange: [-14, 14] });
  const tongue = turn.interpolate({ inputRange: [-1, 1], outputRange: [6, -6] });
  return (
    <Svg width={140} height={140} viewBox="0 0 140 140">
      <Pivot x={70} y={14} rotation={angle}>
        <Circle cx={70} cy={16} r={6} fill="#4a6cf7" />
        <Path d="M28 104C28 98 38 94 40 80C42 52 50 30 70 28C90 30 98 52 100 80C102 94 112 98 112 104Z" fill="#5b7cfa" />
        <Path d="M46 78C47 58 52 42 62 36" stroke="#ffffff" strokeOpacity={0.55} strokeWidth={5} strokeLinecap="round" fill="none" />
        <Rect x={24} y={100} width={92} height={11} rx={5.5} fill="#4767f0" />
        <Circle cx={60} cy={70} r={2.6} fill="#1e2a60" />
        <Circle cx={80} cy={70} r={2.6} fill="#1e2a60" />
        <Path d="M66 77Q70 80.5 74 77" stroke="#1e2a60" strokeWidth={1.8} strokeLinecap="round" fill="none" />
        <AnimatedG translateX={tongue}>
          <Path d="M60 111H80A10 10 0 0 1 60 111Z" fill="#ff2d92" />
        </AnimatedG>
      </Pivot>
    </Svg>
  );
}

function Ask() {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const run = useCommand();
  const allow = async () => {
    close();
    if (await notificationsAllowed(true)) {
      run((tx) => (tx.setSettings({ notifications: true, periodic: true, notificationTime: "20:00", notificationFrequency: "Every day" }), true));
      void writeAnswer("allowed");
    } else void writeAnswer("refused");
  };
  const later = () => {
    close();
    void writeAnswer("later");
  };
  return (
    <View>
      <Text style={{ color: p.ink, fontSize: 24, fontWeight: "500", textAlign: "center" }}>{t.t("Allow to show notifications")}</Text>
      <View style={{ alignItems: "center", marginVertical: 16 }}>
        <Bell />
      </View>
      <Text style={{ color: p.muted, fontSize: 15, lineHeight: 22, textAlign: "center", marginBottom: 10 }}>{t.t("Allow us to show notifications so that we can remind you to record expenses or income.")}</Text>
      <Text style={{ color: p.muted, fontSize: 15, lineHeight: 22, textAlign: "center", marginBottom: 20 }}>{t.t("You can disable or enable notifications, as well as adjust the frequency and time of notifications in the settings.")}</Text>
      <View style={{ gap: 10 }}>
        <Button label="Allow" onPress={() => void allow()} />
        <Button label="Later" kind="outline" onPress={later} />
      </View>
    </View>
  );
}

// Mounted once while the application is open: after a while it opens the question, if it is due.
export function NotificationAsk() {
  const settings = useLedger().settings;
  const already = useRef(settings.notifications);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        if (already.current) return;
        if ((await notificationState()) !== "default") return;
        const last = await readAnswer();
        if (last && (last.answer !== "later" || Date.now() - last.at < AGAIN_AFTER_MS)) return;
        if (!cancelled) sheets.open(<Ask />, "dialog");
      })();
    }, AFTER_START_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  return null;
}
