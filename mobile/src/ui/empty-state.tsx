// Empty states (js/ui/empty-state.js and css/empty-state.css): a picture with a title, a hint and, where the
// person can start, a button. One component for every list that can be empty. Each picture plays its animation
// once, the first time it is shown; after that it is drawn at rest. A picture that is shown again while it is
// still playing goes on from where it was, as in the first application.
import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, View, Text } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { usePalette, useT } from "./app-context.tsx";
import { Button, Icon } from "./kit.tsx";
import { mix } from "./theme.ts";

export type EmptyKind = "operations" | "accounts" | "categories" | "budgets" | "scheduled" | "statistics";

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedPath = Animated.createAnimatedComponent(Path);
// The length of every picture's animation (ms); the time since its first showing decides where it is.
const PLAY_MS: Record<EmptyKind, number> = { operations: 5000, accounts: 2500, categories: 2000, budgets: 800, scheduled: 800, statistics: 2000 };
const firstShown: Partial<Record<EmptyKind, number>> = {};

type Timeline = Animated.Value;
// A value that follows the time (ms) through the given points, and holds the first and the last outside them.
const along = (time: Timeline, points: ReadonlyArray<readonly [number, number]>) =>
  time.interpolate({ inputRange: points.map(([at]) => at), outputRange: points.map(([, value]) => value), extrapolate: "clamp" });
// From one value to another between two moments.
const between = (time: Timeline, start: number, end: number, from: number, to: number) =>
  along(time, [
    [start, from],
    [end, to],
  ]);

// ---- Geometry for the pictures that follow a path --------------------------------------------------

type Point = readonly [number, number];
const cubic = (a: Point, b: Point, c: Point, d: Point, s: number): Point => {
  const u = 1 - s;
  return [u * u * u * a[0] + 3 * u * u * s * b[0] + 3 * u * s * s * c[0] + s * s * s * d[0], u * u * u * a[1] + 3 * u * u * s * b[1] + 3 * u * s * s * c[1] + s * s * s * d[1]];
};
// Points of a chain of cubic curves, evenly spaced along its length, with the whole length.
function walk(curves: ReadonlyArray<readonly [Point, Point, Point, Point]>, steps = 60): { points: Point[]; length: number } {
  const raw: Point[] = [];
  curves.forEach((c, i) => {
    for (let k = i === 0 ? 0 : 1; k <= steps; k++) raw.push(cubic(c[0], c[1], c[2], c[3], k / steps));
  });
  const lengths = [0];
  for (let i = 1; i < raw.length; i++) lengths.push((lengths[i - 1] ?? 0) + Math.hypot((raw[i]?.[0] ?? 0) - (raw[i - 1]?.[0] ?? 0), (raw[i]?.[1] ?? 0) - (raw[i - 1]?.[1] ?? 0)));
  const length = lengths[lengths.length - 1] ?? 0;
  const even: Point[] = [];
  for (let k = 0; k <= 40; k++) {
    const target = (length * k) / 40;
    let i = 1;
    while (i < lengths.length - 1 && (lengths[i] ?? 0) < target) i++;
    const lo = lengths[i - 1] ?? 0;
    const share = (target - lo) / Math.max((lengths[i] ?? 0) - lo, 1e-6);
    const a = raw[i - 1] ?? [0, 0];
    const b = raw[i] ?? a;
    even.push([a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share]);
  }
  return { points: even, length };
}

const BALL_PATH = walk([
  [[104, 18], [100, 28], [88, 34], [82, 46]],
  [[82, 46], [72, 66], [48, 70], [58, 96]],
]);
const ARROW_CURVE = walk([[[12, 52], [40, 54], [70, 30], [106, 4]]]);
// The arrow head: three short straight strokes after the curve.
const ARROW_LENGTH = ARROW_CURVE.length + Math.hypot(13, 0.9) + Math.hypot(13, 0.9) + Math.hypot(4.9, 12);

// ---- The pictures --------------------------------------------------------------------------------

interface Colors {
  ink: string;
  muted: string;
  bg: string;
  accent: string;
  positive: string;
}

// Paper rolled at the top and the bottom with four lines, and a lens that finds nothing.
function Operations({ time, c }: { time: Timeline; c: Colors }) {
  const faint = mix(c.muted, c.bg, 0.55);
  // The lens drifts in, stops at the first line, the middle and the last, hovers, then rests over the corner.
  const scan = (pick: 0 | 1 | 2) => {
    const keys: ReadonlyArray<readonly [number, number, number, number]> = [
      [0, 60, -120, 6],
      [9, 40, -98, 3],
      [21, -58, -84, -3],
      [25, -64, -79, -2],
      [29, -71, -85, -4],
      [41, -136, 8, 2],
      [45, -141, 15, 3],
      [50, -131, 11, 1],
      [62, -146, 76, -3],
      [68, -139, 82, -1],
      [86, 9, -6, 2],
      [100, 0, 0, 0],
    ];
    return along(time, keys.map((k) => [900 + k[0] * 34, k[pick + 1] as number] as const));
  };
  const lensOpacity = along(time, [[900, 0], [900 + 9 * 34, 1]]);
  const crossScale = between(time, 4400, 4800, 0.4, 1);
  const crossOpacity = between(time, 4400, 4800, 0, 1);
  return (
    <Svg width={160} height={160} viewBox="-6 -6 342 342" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <AnimatedG opacity={between(time, 0, 500, 0, 1)}>
        <Path d="M270 6H96A48 48 0 0 0 48 54V128M48 149V150M48 170V275M266 40V262C266 300 252 328 238 328H200" stroke={c.muted} strokeWidth={7} />
        <Path d="M262 2.5h41a25.5 25.5 0 0 1 25.5 25.5V67H262zM7 270H188C188 305 204 331.5 240 331.5H37A30 30 0 0 1 7 301.5z" fill={c.muted} stroke="none" />
      </AnimatedG>
      {([[65, 235, 0], [115, 208, 1], [168, 152, 2], [220, 152, 3]] as const).map(([y, to, i]) => {
        const length = to - 89;
        return <AnimatedPath key={i} d={`M89 ${y}H${to}`} stroke={faint} strokeWidth={7} strokeDasharray={[length, length]} strokeDashoffset={between(time, 300 + i * 250, 700 + i * 250, length, 0)} />;
      })}
      <AnimatedG opacity={lensOpacity} translateX={scan(0)} translateY={scan(1)} rotation={scan(2)} originX={262} originY={157}>
        <Circle cx={259} cy={152} r={62} fill={c.bg} stroke={faint} strokeWidth={7} />
        <Path d="m303 197 24 28" stroke={faint} strokeWidth={12} />
        <AnimatedG opacity={crossOpacity} scale={crossScale} originX={259} originY={152}>
          <Path d="m237 130 44 44m0-44-44 44" stroke={c.accent} strokeWidth={7} />
        </AnimatedG>
      </AnimatedG>
    </Svg>
  );
}

// A wallet: a coin drops into it and banknotes rise out of it.
function Accounts({ time, c }: { time: Timeline; c: Colors }) {
  const coin = { fill: "#f5b53a", stroke: c.ink, strokeWidth: 3 } as const;
  const note = { fill: "#8fd16f", stroke: c.ink, strokeWidth: 4 } as const;
  const mark = { fill: "#f4f1d4", stroke: c.ink, strokeWidth: 2 } as const;
  const rest = between(time, 0, 400, 0, 1);
  return (
    <Svg width={160} height={160} viewBox="0 0 160 160" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <AnimatedG opacity={along(time, [[1500, 0], [1500 + 0.2 * 900, 1]])} translateY={between(time, 1500, 2400, 38, 0)}>
        <G rotation={14} originX={100} originY={50}>
          <Rect x={72} y={22} width={52} height={34} rx={4} {...note} />
          <Circle cx={98} cy={39} r={7} {...mark} />
        </G>
        <G rotation={-6} originX={80} originY={50}>
          <Rect x={54} y={20} width={52} height={34} rx={4} {...note} />
          <Circle cx={80} cy={37} r={7} {...mark} />
        </G>
      </AnimatedG>
      <AnimatedG opacity={rest}>
        <Rect x={12} y={44} width={116} height={92} rx={18} fill="#ef7f66" stroke={c.ink} strokeWidth={4} />
        <Rect x={21} y={53} width={98} height={74} rx={11} stroke={c.ink} strokeWidth={2} strokeDasharray="4 5" />
        <Rect x={88} y={76} width={50} height={34} rx={9} fill="#f2a553" stroke={c.ink} strokeWidth={4} />
        <Circle cx={108} cy={93} r={7} fill="#b9b9b9" stroke={c.ink} strokeWidth={3} />
      </AnimatedG>
      <AnimatedG opacity={rest}>
        <Rect x={106} y={126} width={26} height={8} rx={4} {...coin} />
        <Rect x={106} y={117} width={26} height={8} rx={4} {...coin} />
      </AnimatedG>
      <AnimatedG opacity={along(time, [[400, 0], [400 + 0.15 * 700, 1]])} translateY={between(time, 400, 1100, -80, 0)}>
        <Rect x={106} y={108} width={26} height={8} rx={4} {...coin} />
      </AnimatedG>
    </Svg>
  );
}

// An open box: a ball flies into it along a dotted path.
function Categories({ time, c }: { time: Timeline; c: Colors }) {
  // The ball eases in and out along the path; it is seen from the start, and fades at the end.
  const ease = Easing.inOut(Easing.ease);
  const spots = BALL_PATH.points.map((point, i, all) => ({ at: 400 + ease(i / (all.length - 1)) * 1100, point }));
  const ballX = along(time, spots.map((s) => [s.at, s.point[0]] as const));
  const ballY = along(time, spots.map((s) => [s.at, s.point[1]] as const));
  const dot = BALL_PATH.length * 0.03;
  return (
    <Svg width={160} height={160} viewBox="0 0 160 160" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <AnimatedG opacity={between(time, 0, 400, 0, 1)}>
        <Path d="M80 64 134 86 80 108 26 86z" fill={mix(c.muted, c.bg, 0.45)} />
        <Path d="M26 86 80 108V152L26 130z" fill={mix(c.muted, c.bg, 0.35)} />
        <Path d="M134 86 80 108V152L134 130z" fill={mix(c.muted, c.bg, 0.18)} />
        <Path d="M26 86 8 76 62 54 80 64M134 86 152 76 98 54 80 64" fill={mix(c.muted, c.bg, 0.12)} />
      </AnimatedG>
      <AnimatedG opacity={along(time, [[400, 0], [625, 1], [1600, 1], [1900, 0]])}>
        <Path d="M104 18C100 28 88 34 82 46 72 66 48 70 58 96" stroke={c.muted} strokeWidth={2} strokeDasharray={[dot, dot]} />
      </AnimatedG>
      <AnimatedG opacity={along(time, [[0, 1], [400 + 0.85 * 1100, 1], [1500, 0]])} translateX={ballX} translateY={ballY}>
        <Circle cx={0} cy={0} r={6} fill={c.bg} stroke={c.muted} strokeWidth={2} />
      </AnimatedG>
    </Svg>
  );
}

// Six bars rising along an arrow that is drawn from left to right.
function Statistics({ time, c }: { time: Timeline; c: Colors }) {
  const fills = ["#f5a623", "#c9c93a", "#8bd23f", "#19b8a6", "#3a8fe0", c.accent];
  const bars: ReadonlyArray<readonly [number, number, number]> = [[10, 80, 20], [28, 68, 32], [46, 56, 44], [64, 44, 56], [82, 32, 68], [100, 20, 80]];
  return (
    <Svg width={160} height={160} viewBox="0 0 120 120" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {bars.map(([x, y, height], i) => (
        <AnimatedG key={x} opacity={between(time, i * 200, i * 200 + 500, 0, 1)} scaleY={between(time, i * 200, i * 200 + 500, 0, 1)} originX={x + 6} originY={100}>
          <Rect x={x} y={y} width={12} height={height} rx={4} fill={fills[i]} />
        </AnimatedG>
      ))}
      <AnimatedPath
        d="M12 52C40 54 70 30 106 4L93.0 4.9 106 4 101.1 16.0"
        stroke={c.positive}
        strokeWidth={4}
        strokeDasharray={[ARROW_LENGTH, ARROW_LENGTH]}
        strokeDashoffset={between(time, 500, 1900, ARROW_LENGTH, 0)}
      />
    </Svg>
  );
}

// A plain icon that pops in (budgets, scheduled payments).
function Pop({ time, name, color }: { time: Timeline; name: string; color: string }) {
  const scale = along(time, [[0, 0.4], [350, 1.12], [700, 1]]);
  const opacity = between(time, 0, 250, 0, 1);
  return (
    <Animated.View style={{ opacity, transform: [{ scale }] }}>
      <Icon name={name} size={96} color={color} />
    </Animated.View>
  );
}

// ---- The block -------------------------------------------------------------------------------------

export function EmptyState({ kind, title, hint, action, onAction }: { kind: EmptyKind; title: string; hint: string; action?: string; onAction?: () => void }): ReactNode {
  const p = usePalette();
  const t = useT();
  const total = PLAY_MS[kind];
  const since = (firstShown[kind] ??= Date.now());
  const start = Math.min(Date.now() - since, total);
  const time = useRef(new Animated.Value(start)).current;
  useEffect(() => {
    if (start >= total) return;
    const run = Animated.timing(time, { toValue: total, duration: total - start, easing: Easing.linear, useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [time, start, total]);
  const c: Colors = { ink: p.ink, muted: p.muted, bg: p.bg, accent: p.accent, positive: p.positive };
  return (
    <View style={{ alignItems: "center", paddingTop: 56, paddingHorizontal: 32, paddingBottom: 24 }}>
      <View style={{ alignItems: "center" }} importantForAccessibility="no-hide-descendants">
        {kind === "operations" ? <Operations time={time} c={c} /> : null}
        {kind === "accounts" ? <Accounts time={time} c={c} /> : null}
        {kind === "categories" ? <Categories time={time} c={c} /> : null}
        {kind === "statistics" ? <Statistics time={time} c={c} /> : null}
        {kind === "budgets" ? <Pop time={time} name="budget" color={p.accent} /> : null}
        {kind === "scheduled" ? <Pop time={time} name="calendar" color={p.accent} /> : null}
      </View>
      <Text style={{ color: p.ink, fontSize: 20, fontWeight: "500", marginTop: 12, marginBottom: 8, textAlign: "center" }}>{t.t(title)}</Text>
      <Text style={{ color: p.muted, fontSize: 14, textAlign: "center" }}>{t.t(hint)}</Text>
      {action && onAction ? (
        <View style={{ width: "100%", maxWidth: 270, marginTop: 24 }}>
          <Button label={action} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}
