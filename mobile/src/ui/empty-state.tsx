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
const AnimatedRect = Animated.createAnimatedComponent(Rect);
// The length of every picture's animation (ms); the time since its first showing decides where it is.
const PLAY_MS: Record<EmptyKind, number> = { operations: 2500, accounts: 2500, categories: 2000, budgets: 2100, scheduled: 1200, statistics: 2000 };
const firstShown: Partial<Record<EmptyKind, number>> = {};

type Timeline = Animated.Value;
// A value that follows the time (ms) through the given points, and holds the first and the last outside them. With
// `easing`, every stretch between two points is eased on its own (a move starts and stops softly).
const along = (time: Timeline, points: ReadonlyArray<readonly [number, number]>, easing?: (n: number) => number) =>
  time.interpolate({ inputRange: points.map(([at]) => at), outputRange: points.map(([, value]) => value), extrapolate: "clamp", easing });
// From one value to another between two moments.
const between = (time: Timeline, start: number, end: number, from: number, to: number, easing?: (n: number) => number) =>
  along(
    time,
    [
      [start, from],
      [end, to],
    ],
    easing,
  );
const soft = Easing.inOut(Easing.cubic);
const out = Easing.out(Easing.cubic);

// ---- Geometry for the pictures that follow a path --------------------------------------------------

type Point = readonly [number, number];
const cubic = (a: Point, b: Point, c: Point, d: Point, s: number): Point => {
  const u = 1 - s;
  return [u * u * u * a[0] + 3 * u * u * s * b[0] + 3 * u * s * s * c[0] + s * s * s * d[0], u * u * u * a[1] + 3 * u * u * s * b[1] + 3 * u * s * s * c[1] + s * s * s * d[1]];
};
// The length of a cubic curve (summed over short straight pieces).
function lengthOf(a: Point, b: Point, c: Point, d: Point): number {
  let length = 0;
  let last = a;
  for (let k = 1; k <= 80; k++) {
    const next = cubic(a, b, c, d, k / 80);
    length += Math.hypot(next[0] - last[0], next[1] - last[1]);
    last = next;
  }
  return length;
}

// The statistics arrow: a curve that keeps 5–10 units above the tops of the bars (checked for every bar), so it
// follows their rise without crossing one, and a head along its last direction.
const BARS: ReadonlyArray<readonly [number, number]> = [[8, 16], [26, 24], [44, 34], [62, 46], [80, 60], [98, 78]]; // left, height
const ARROW: readonly [Point, Point, Point, Point] = [[4, 74], [30, 78], [70, 40], [110, 6]];
const ARROW_LENGTH = lengthOf(...ARROW);

// ---- The pictures --------------------------------------------------------------------------------

interface Colors {
  ink: string;
  muted: string;
  bg: string;
  accent: string;
  positive: string;
}

// A sheet of paper with its top rolled at the right and its bottom curled, a few lines on it, and a lens that looks
// at two places, comes back and finds nothing (2.5 s).
function Operations({ time, c }: { time: Timeline; c: Colors }) {
  const faint = mix(c.muted, c.bg, 0.55);
  // The lens rests over the lower right of the sheet; it moves to the first lines, then to the last, and back.
  const keys: ReadonlyArray<readonly [number, number, number]> = [
    [300, 40, -10],
    [800, -112, -84],
    [1050, -104, -80],
    [1450, -92, 20],
    [1650, -98, 24],
    [2050, 0, 0],
  ];
  const lensX = along(time, keys.map(([at, x]) => [at, x] as const), soft);
  const lensY = along(time, keys.map(([at, , y]) => [at, y] as const), soft);
  return (
    <Svg width={160} height={160} viewBox="-6 -6 342 342" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <AnimatedG opacity={between(time, 0, 300, 0, 1)}>
        <Path d="M70 238V70A28 28 0 0 1 98 42H280M224 294H56A28 28 0 0 1 28 266V238H196V266A28 28 0 1 0 252 266V70A28 28 0 1 1 308 70V112H252" stroke={c.muted} strokeWidth={10} />
      </AnimatedG>
      {([[90, 214], [128, 222], [166, 170], [204, 160]] as const).map(([y, to], i) => {
        const length = to - 104;
        return <AnimatedPath key={y} d={`M104 ${y}H${to}`} stroke={faint} strokeWidth={10} strokeDasharray={[length, length]} strokeDashoffset={between(time, 200 + i * 150, 500 + i * 150, length, 0)} />;
      })}
      <AnimatedG opacity={between(time, 300, 500, 0, 1)} translateX={lensX} translateY={lensY}>
        <Circle cx={232} cy={178} r={50} fill={c.bg} stroke={faint} strokeWidth={10} />
        <Path d="m269 215 26 28" stroke={faint} strokeWidth={16} />
        <AnimatedG opacity={between(time, 2050, 2300, 0, 1)} scale={between(time, 2050, 2350, 0.4, 1, Easing.out(Easing.back(2)))} originX={232} originY={178}>
          <Path d="m214 160 36 36m0-36-36 36" stroke={c.accent} strokeWidth={10} />
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

// An open box: three balls jump out of it one after another and pop in the air (2 s); the box stays.
const BALLS: ReadonlyArray<{ to: Point; start: number }> = [
  { to: [44, 22], start: 300 },
  { to: [84, 12], start: 600 },
  { to: [122, 24], start: 900 },
];
function Categories({ time, c }: { time: Timeline; c: Colors }) {
  const colors = [c.accent, c.positive, "#f5b53a"];
  return (
    <Svg width={160} height={160} viewBox="0 0 160 160" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <AnimatedG opacity={between(time, 0, 300, 0, 1)}>
        <Path d="M80 64 134 86 80 108 26 86z" fill={mix(c.muted, c.bg, 0.45)} />
      </AnimatedG>
      {BALLS.map(({ to, start }, i) => {
        const fly = start + 550; // where the ball is highest and pops
        // Out of the box's opening (behind its front, which is drawn after), up to its place, easing as it rises.
        const x = between(time, start, fly, 80, to[0]);
        const y = between(time, start, fly, 96, to[1], out);
        return (
          <G key={i}>
            <AnimatedG translateX={x} translateY={y} opacity={along(time, [[start - 1, 0], [start, 1], [fly, 1], [fly + 180, 0]])}>
              <AnimatedG scale={along(time, [[fly - 60, 1], [fly + 180, 1.7]])}>
                <Circle cx={0} cy={0} r={7} fill={colors[i]} />
              </AnimatedG>
            </AnimatedG>
            {/* The pop: short strokes flying apart where the ball was. */}
            <AnimatedG translateX={to[0]} translateY={to[1]} opacity={along(time, [[fly, 0], [fly + 60, 1], [fly + 300, 0]])}>
              <AnimatedG scale={between(time, fly, fly + 300, 0.6, 1.3, out)}>
                <Path d="M0-11V-16M11 0H16M0 11V16M-11 0H-16M8-8 11-11M8 8 11 11M-8 8-11 11M-8-8-11-11" stroke={colors[i]} strokeWidth={2.5} />
              </AnimatedG>
            </AnimatedG>
          </G>
        );
      })}
      <AnimatedG opacity={between(time, 0, 300, 0, 1)}>
        <Path d="M26 86 80 108V152L26 130z" fill={mix(c.muted, c.bg, 0.35)} />
        <Path d="M134 86 80 108V152L134 130z" fill={mix(c.muted, c.bg, 0.18)} />
        <Path d="M26 86 8 76 62 54 80 64M134 86 152 76 98 54 80 64" fill={mix(c.muted, c.bg, 0.12)} />
      </AnimatedG>
    </Svg>
  );
}

// Six bars growing from the bottom up, one after another from left to right, and an arrow drawn over their tops (2 s).
function Statistics({ time, c }: { time: Timeline; c: Colors }) {
  const fills = ["#f5a623", "#c9c93a", "#8bd23f", "#19b8a6", "#3a8fe0", c.accent];
  const [a, b, cc, d] = ARROW;
  return (
    <Svg width={160} height={160} viewBox="0 0 120 120" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {BARS.map(([x, height], i) => {
        // The bar's height grows while its foot stays on the ground (its top moves up): no scaling around a point.
        const grown = between(time, i * 220, i * 220 + 450, 0, height, out);
        return <AnimatedRect key={x} x={x} y={Animated.subtract(100, grown)} width={12} height={grown} rx={4} fill={fills[i]} />;
      })}
      <AnimatedPath
        d={`M${a[0]} ${a[1]}C${b[0]} ${b[1]} ${cc[0]} ${cc[1]} ${d[0]} ${d[1]}`}
        stroke={c.positive}
        strokeWidth={4}
        strokeDasharray={[ARROW_LENGTH, ARROW_LENGTH]}
        strokeDashoffset={between(time, 250, 1650, ARROW_LENGTH, 0)}
      />
      <AnimatedPath d="M99.3 8.4 110 6 105.9 16.2" stroke={c.positive} strokeWidth={4} opacity={between(time, 1600, 1750, 0, 1)} />
    </Svg>
  );
}

// A banknote, and a coin that appears beside it and goes once around it (behind it on the far side), back to its
// place (2.1 s).
const ORBIT = Array.from({ length: 41 }, (_, k) => {
  const angle = Math.PI / 4 + (k / 40) * Math.PI * 2;
  return { x: 80 + 64 * Math.cos(angle), y: 84 + 32 * Math.sin(angle), near: Math.sin(angle) >= 0, scale: 0.85 + 0.15 * Math.sin(angle) };
});
function Budgets({ time, c }: { time: Timeline; c: Colors }) {
  const at = (k: number) => 550 + (k / 40) * 1500;
  const coinX = along(time, ORBIT.map((o, k) => [at(k), o.x] as const));
  const coinY = along(time, ORBIT.map((o, k) => [at(k), o.y] as const));
  const coinScale = along(time, [[300, 0], ...ORBIT.map((o, k) => [at(k), o.scale] as const)]);
  // Seen in front of the note on the near half of the way, behind it on the far half.
  const near = along(time, ORBIT.flatMap((o, k) => [[at(k) - 0.01, o.near ? 1 : 0] as const, [at(k), o.near ? 1 : 0] as const]).slice(1));
  const far = near.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const coin = (opacity: typeof near) => (
    <AnimatedG opacity={opacity} translateX={coinX} translateY={coinY}>
      <AnimatedG scale={coinScale}>
        <Circle cx={0} cy={0} r={15} fill="#f5b53a" stroke={c.ink} strokeWidth={3} />
        <Circle cx={0} cy={0} r={8} stroke={c.ink} strokeWidth={2} />
      </AnimatedG>
    </AnimatedG>
  );
  return (
    <Svg width={160} height={160} viewBox="0 0 160 160" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {coin(far)}
      <AnimatedG opacity={between(time, 0, 200, 0, 1)} scale={between(time, 0, 350, 0.6, 1, Easing.out(Easing.back(2)))} originX={80} originY={80}>
        <G rotation={-8} originX={80} originY={80}>
          <Rect x={32} y={52} width={96} height={58} rx={8} fill="#8fd16f" stroke={c.ink} strokeWidth={4} />
          <Rect x={40} y={60} width={80} height={42} rx={4} stroke={c.ink} strokeWidth={2} strokeDasharray="4 5" />
          <Circle cx={80} cy={81} r={12} fill="#f4f1d4" stroke={c.ink} strokeWidth={3} />
        </G>
      </AnimatedG>
      {coin(near)}
    </Svg>
  );
}

// A calendar in a light circle that wiggles once (1.2 s).
function Scheduled({ time, c }: { time: Timeline; c: Colors }) {
  const rotate = time.interpolate({ inputRange: [250, 400, 550, 700, 850, 1000], outputRange: ["0deg", "-14deg", "11deg", "-7deg", "3deg", "0deg"], extrapolate: "clamp" });
  return (
    <Animated.View style={{ width: 128, height: 128, borderRadius: 64, backgroundColor: mix(c.accent, c.bg, 0.84), alignItems: "center", justifyContent: "center", opacity: between(time, 0, 200, 0, 1), transform: [{ scale: between(time, 0, 250, 0.7, 1, out) }] }}>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Icon name="calendar" size={64} color={c.accent} />
      </Animated.View>
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
        {kind === "budgets" ? <Budgets time={time} c={c} /> : null}
        {kind === "scheduled" ? <Scheduled time={time} c={c} /> : null}
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
