// A figure whose digits roll like a counter when it changes: each digit is a column of 0–9 that slides up or down to
// the new digit, left to right with a small delay, and slows at the end. The first drawing shows the figure at once.
// Only the digits move (native driver); signs, separators and the currency stay as text.
import { memo, useEffect, useRef } from "react";
import { Animated, Easing, Text, View } from "react-native";

const COLUMN = "0\n1\n2\n3\n4\n5\n6\n7\n8\n9";

const Digit = memo(function Digit({ digit, delay, color, size, line }: { digit: number; delay: number; color: string; size: number; line: number }) {
  const y = useRef(new Animated.Value(-digit * line)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      y.setValue(-digit * line);
      return;
    }
    Animated.timing(y, { toValue: -digit * line, duration: 650, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [digit, line, delay, y]);
  return (
    <View style={{ height: line, overflow: "hidden" }}>
      <Animated.View style={{ transform: [{ translateY: y }] }}>
        <Text style={{ color, fontSize: size, lineHeight: line, fontVariant: ["tabular-nums"] }}>{COLUMN}</Text>
      </Animated.View>
    </View>
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
