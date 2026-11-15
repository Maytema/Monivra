// A figure whose changed digits slide in from below, left to right with a small delay, and slow at the end. The first
// drawing shows the figure at once. Only the digits move (native driver); signs, separators and the currency stay as text.
import { memo, useEffect, useRef } from "react";
import { Animated, Easing, Text, View } from "react-native";

// A digit that changed slides in from below and fades in (the old one is replaced at once), slowing at the end. It is
// always drawn as plain text, so it can never be hidden by a clip: the first version, a clipped column of 0–9, came out
// blank on the emulator.
const Digit = memo(function Digit({ digit, delay, color, size, line }: { digit: number; delay: number; color: string; size: number; line: number }) {
  const t = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    t.setValue(0);
    Animated.timing(t, { toValue: 1, duration: 520, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [digit, delay, t]);
  return (
    <Animated.Text style={{ color, fontSize: size, lineHeight: line, fontVariant: ["tabular-nums"], opacity: t, transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [line * 0.6, 0] }) }] }}>
      {digit}
    </Animated.Text>
  );
});

export const RollingFigure = memo(function RollingFigure({ text, color, size = 27, line = 42 }: { text: string; color: string; size?: number; line?: number }) {
  const chars = [...text];
  // Narrower for long figures so the line stays inside the screen.
  const fit = chars.length > 17 ? size * 0.78 : chars.length > 14 ? size * 0.88 : size;
  return (
    <View accessible accessibilityLabel={text} style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", height: line }}>
      {chars.map((c, i) => {
        // The key counts from the right, so a digit keeps its column when a figure gets longer or shorter.
        const key = chars.length - i;
        return /[0-9]/.test(c) ? (
          <Digit key={key} digit={Number(c)} delay={i * 28} color={color} size={fit} line={line} />
        ) : (
          <Text key={key} style={{ color, fontSize: fit, lineHeight: line }}>{c}</Text>
        );
      })}
    </View>
  );
});
