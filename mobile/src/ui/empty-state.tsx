// Empty states (js/ui/empty-state.js and css/empty-state.css): a picture with a title, a hint and, where the
// person can start, a button. One component for every list that can be empty. Each picture plays its animation
// once, the first time it is shown (the pictures of budgets and scheduled payments, which are screens that are opened
// and left, at every opening); after that it is drawn at rest. A picture that is shown again while it is still
// playing goes on from where it was, as in the first application.
import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, View, Text } from "react-native";
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";
import { NOTE_FRAMES, RING_FRAMES } from "./budget-motion.ts";
import { usePalette, useT } from "./app-context.tsx";
import { Button } from "./kit.tsx";
import { mix } from "./theme.ts";

export type EmptyKind = "operations" | "accounts" | "categories" | "budgets" | "scheduled" | "statistics";

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
// How long each picture plays (ms), taken from the first application's recordings (frame by frame, 2026-11-22): the
// time from the picture's first frame to its last movement. The time since the first showing decides where it is.
const PLAY_MS: Record<EmptyKind, number> = { operations: 4800, accounts: 3000, categories: 1400, budgets: 3200, scheduled: 2050, statistics: 2000 };
// These two are screens that are opened and left (not tabs): their picture plays at every opening. The pictures of
// the tabs play once while the application runs, so they do not play again at every swipe between tabs.
const REPLAYS: ReadonlySet<EmptyKind> = new Set<EmptyKind>(["budgets", "scheduled"]);
const firstShown: Partial<Record<EmptyKind, number>> = {};

type Timeline = Animated.Value;
type Ease = (n: number) => number;
// A value that follows the time (ms) through the keys [time, value, easing?]; the easing, when given, shapes the
// stretch that ends at that key. Before the first key and after the last the value holds.
type Key = readonly [number, number, Ease?];
function keyed(time: Timeline, keys: ReadonlyArray<Key>) {
  const input: number[] = [];
  const output: number[] = [];
  keys.forEach((key, i) => {
    if (i === 0) {
      input.push(key[0]);
      output.push(key[1]);
      return;
    }
    const prev = keys[i - 1]!;
    const steps = key[2] ? 10 : 1;
    for (let k = 1; k <= steps; k++) {
      const f = k / steps;
      input.push(prev[0] + (key[0] - prev[0]) * f);
      output.push(prev[1] + (key[1] - prev[1]) * (key[2] ? key[2](f) : f));
    }
  });
  return time.interpolate({ inputRange: input, outputRange: output, extrapolate: "clamp" });
}
// A group turned or scaled about the point (x, y). Written as three nested groups (move there, turn, move back), so
// that no "origin" property is needed: on an animated group the origin was not honoured and the picture turned about
// the corner of the drawing instead and slid away from its place.
function Pivot({ x, y, rotation, scale, children }: { x: number; y: number; rotation?: Animated.AnimatedInterpolation<number> | number; scale?: Animated.AnimatedInterpolation<number> | number; children: ReactNode }) {
  return (
    <G translateX={x} translateY={y}>
      <AnimatedG rotation={rotation} scale={scale}>
        <G translateX={-x} translateY={-y}>{children}</G>
      </AnimatedG>
    </G>
  );
}
const between = (time: Timeline, start: number, end: number, from: number, to: number, easing?: Ease) =>
  keyed(time, [[start, from], [end, to, easing]]);
const soft: Ease = Easing.inOut(Easing.sin);
const out: Ease = Easing.out(Easing.cubic);
const pop: Ease = Easing.out(Easing.back(2.2));

type Point = readonly [number, number];
const cubic = (a: Point, b: Point, c: Point, d: Point, s: number): Point => {
  const u = 1 - s;
  return [u * u * u * a[0] + 3 * u * u * s * b[0] + 3 * u * s * s * c[0] + s * s * s * d[0], u * u * u * a[1] + 3 * u * u * s * b[1] + 3 * u * s * s * c[1] + s * s * s * d[1]];
};
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
const star = (cx: number, cy: number, outer: number, inner: number) =>
  Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? inner : outer;
    return `${i ? "L" : "M"}${(cx + r * Math.cos(angle)).toFixed(1)} ${(cy + r * Math.sin(angle)).toFixed(1)}`;
  }).join("") + "Z";

interface Colors {
  ink: string;
  muted: string;
  bg: string;
  accent: string;
  positive: string;
}

// ---- Operations (4.7 s) ------------------------------------------------------------------------------
// A sheet of paper (its top corner rolled over, its bottom curled up), its lines drawn one after another, and a lens
// with a cross that comes in, moves up and left turning its cross into a plus, goes down over the sheet, and comes
// back turning the plus into a cross again (positions and angles measured on the recording, in its pixels).
function Operations({ time, c }: { time: Timeline; c: Colors }) {
  const dark = c.muted;
  const faint = mix(c.muted, c.bg, 0.45);
  const lensColor = mix(c.muted, c.bg, 0.62);
  const x = keyed(time, [[100, 25], [570, 19], [1100, 4, out], [1430, 2], [2170, -30, soft], [2630, -31], [3570, -31], [3830, -31], [4500, -1, out], [4700, 0]]);
  const y = keyed(time, [[100, 34], [570, 27], [1100, 5, out], [1430, 3], [2170, -22, soft], [2630, -23], [3570, 49, out], [3830, 49], [4500, -1, out], [4700, 0]]);
  const cross = keyed(time, [[100, 45], [1430, 45], [2170, 6, soft], [3830, 6], [4500, 45, out]]);
  const lines: ReadonlyArray<readonly [number, number]> = [[225, 433], [275, 405], [329, 351], [380, 351]];
  return (
    <Svg width={170} height={170} viewBox="200 155 340 340" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <AnimatedG opacity={between(time, 0, 120, 0, 1)}>
        <Path d="M248 215A48 48 0 0 1 296 167H466M466 226V440M248 215V286M248 295V301M248 330V430" stroke={dark} strokeWidth={6} />
        <Path d="M463 226V167H497A31 31 0 0 1 528 198V218A8 8 0 0 1 520 226Z" fill={dark} stroke="none" />
        <Path d="M222 430H393C393 462 408 476 432 476C450 476 462 462 462 440H470C470 468 452 488 430 488H222A14 14 0 0 1 208 474V444A14 14 0 0 1 222 430Z" fill={dark} stroke="none" />
      </AnimatedG>
      {lines.map(([ly, to], i) => {
        const length = to - 290;
        return <AnimatedPath key={ly} d={`M290 ${ly}H${to}`} stroke={faint} strokeWidth={6} strokeDasharray={[length, length]} strokeDashoffset={between(time, 100 + i * 60, 430 + i * 60, length, 0, out)} />;
      })}
      <AnimatedG opacity={between(time, 100, 160, 0, 1)} translateX={x} translateY={y}>
        <Pivot x={459} y={314} scale={between(time, 100, 800, 0.3, 1, out)}>
          <Circle cx={459} cy={314} r={62} fill={c.bg} stroke={lensColor} strokeWidth={6} />
          <Path d="M493 372L522 407" stroke={lensColor} strokeWidth={13} />
          <Pivot x={459} y={314} rotation={cross}>
            <Path d="M429 314H489M459 284V344" stroke={c.accent} strokeWidth={6} />
          </Pivot>
        </Pivot>
      </AnimatedG>
    </Svg>
  );
}

// ---- Accounts (3 s) ----------------------------------------------------------------------------------
// A wallet: three coins fall into it one after another, a fourth lies down against the stack, and two banknotes rise
// out of it.
function Accounts({ time, c }: { time: Timeline; c: Colors }) {
  const coin = { fill: "#f5b53a", stroke: c.ink, strokeWidth: 3 } as const;
  const note = { fill: "#8fd16f", stroke: c.ink, strokeWidth: 4 } as const;
  const mark = { fill: "#f4f1d4", stroke: c.ink, strokeWidth: 2 } as const;
  const drop = (start: number, rest: number) => (
    <AnimatedG opacity={keyed(time, [[start, 0], [start + 80, 1]])} translateY={between(time, start, start + 450, -110, 0, Easing.in(Easing.quad))}>
      <Rect x={106} y={rest} width={26} height={8} rx={4} {...coin} />
    </AnimatedG>
  );
  return (
    <Svg width={160} height={160} viewBox="0 0 160 160" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <AnimatedG opacity={keyed(time, [[2400, 0], [2500, 1]])} translateY={between(time, 2400, 2900, 40, 0, out)}>
        <Pivot x={100} y={50} rotation={14}>
          <Rect x={72} y={22} width={52} height={34} rx={4} {...note} />
          <Circle cx={98} cy={39} r={7} {...mark} />
        </Pivot>
        <Pivot x={80} y={50} rotation={-6}>
          <Rect x={54} y={20} width={52} height={34} rx={4} {...note} />
          <Circle cx={80} cy={37} r={7} {...mark} />
        </Pivot>
      </AnimatedG>
      <AnimatedG opacity={between(time, 0, 100, 0, 1)}>
        <Rect x={12} y={44} width={116} height={92} rx={18} fill="#ef7f66" stroke={c.ink} strokeWidth={4} />
        <Rect x={21} y={53} width={98} height={74} rx={11} stroke={c.ink} strokeWidth={2} strokeDasharray="4 5" />
        <Rect x={88} y={76} width={50} height={34} rx={9} fill="#f2a553" stroke={c.ink} strokeWidth={4} />
        <Circle cx={108} cy={93} r={7} fill="#b9b9b9" stroke={c.ink} strokeWidth={3} />
      </AnimatedG>
      {drop(300, 126)}
      {drop(750, 117)}
      {drop(1200, 108)}
      <AnimatedG opacity={keyed(time, [[1800, 0], [1850, 1]])} translateX={between(time, 1800, 2200, 40, 0, out)} translateY={between(time, 1800, 2200, -50, 0, Easing.in(Easing.quad))}>
        <Pivot x={140} y={122} rotation={-38}>
          <Rect x={127} y={118} width={26} height={8} rx={4} {...coin} />
        </Pivot>
      </AnimatedG>
    </Svg>
  );
}

// ---- Categories (1.3 s) ------------------------------------------------------------------------------
// An open box and one bubble that comes out of it along a dotted curve, goes to the top and fades away with its trail.
const WAY: ReadonlyArray<readonly [Point, Point, Point, Point]> = [
  [[79, 95], [66, 82], [92, 66], [113, 47]],
  [[113, 47], [123, 36], [100, 22], [80, 19.5]],
];
const wayAt = (s: number): Point => (s < 0.55 ? cubic(...WAY[0]!, s / 0.55) : cubic(...WAY[1]!, (s - 0.55) / 0.45));
const DASHES = 16;
function Categories({ time, c }: { time: Timeline; c: Colors }) {
  const line = mix(c.muted, c.bg, 0.1);
  const reach = Array.from({ length: 21 }, (_, k) => k / 20);
  const bx = keyed(time, reach.map((s) => [650 * (1 - Math.cbrt(1 - s)), wayAt(s)[0]] as Key));
  const by = keyed(time, reach.map((s) => [650 * (1 - Math.cbrt(1 - s)), wayAt(s)[1]] as Key));
  const fade = keyed(time, [[900, 1], [1300, 0]]);
  return (
    <Svg width={160} height={160} viewBox="0 0 160 160" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <G>
        <Path d="M80 64 134 86 80 108 26 86z" fill={mix(c.muted, c.bg, 0.45)} />
        <Path d="M26 86 80 108V152L26 130z" fill={mix(c.muted, c.bg, 0.35)} />
        <Path d="M134 86 80 108V152L134 130z" fill={mix(c.muted, c.bg, 0.18)} />
        <Path d="M26 86 8 76 62 54 80 64M134 86 152 76 98 54 80 64" fill={mix(c.muted, c.bg, 0.12)} />
      </G>
      <AnimatedG opacity={fade}>
        {Array.from({ length: DASHES }, (_, i) => {
          const a = wayAt(i / DASHES);
          const b = wayAt((i + 0.55) / DASHES);
          const seen = 650 * (1 - Math.cbrt(1 - i / DASHES));
          return <AnimatedPath key={i} d={`M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`} stroke={line} strokeWidth={1.6} opacity={keyed(time, [[seen, 0], [seen + 40, 1]])} />;
        })}
        <AnimatedG translateX={bx} translateY={by} opacity={keyed(time, [[0, 0], [60, 1]])}>
          <Circle cx={-3} cy={0} r={6} stroke={c.muted} strokeWidth={1.8} fill={c.bg} />
          <Circle cx={5} cy={-1} r={5} stroke={c.muted} strokeWidth={1.8} fill={c.bg} />
          <Circle cx={0} cy={4} r={1.8} fill={c.muted} />
        </AnimatedG>
      </AnimatedG>
    </Svg>
  );
}

// ---- Statistics (1.9 s) ------------------------------------------------------------------------------
// An arrow drawn from the lower left along the bars' tops, and five bars growing from the ground up one after another
// from left to right (each from its own moment, under the arrow), then a star over the last. Measured on the recording.
const GROUND = 485;
const COLUMNS: ReadonlyArray<{ x: number; height: number; color: string; start: number }> = [
  { x: 146, height: 82, color: "#f7d14f", start: 630 },
  { x: 204, height: 120, color: "#96cb64", start: 720 },
  { x: 262, height: 159, color: "#48cf97", start: 880 },
  { x: 320, height: 206, color: "#3390e9", start: 1050 },
  { x: 378, height: 261, color: "#6b37fe", start: 1380 },
];
const BAR = (x: number, h: number) => `M${x} ${GROUND}V${GROUND - h + 10}A10 10 0 0 1 ${x + 10} ${GROUND - h}H${x + 30}A10 10 0 0 1 ${x + 40} ${GROUND - h + 10}V${GROUND}Z`;
const ARROW_FROM: Point = [84, 403];
const ARROW_C1: Point = [190, 375];
const ARROW_C2: Point = [290, 300];
const ARROW_TO: Point = [360, 207];
const ARROW_LENGTH = lengthOf(ARROW_FROM, ARROW_C1, ARROW_C2, ARROW_TO);
function Statistics({ time, c }: { time: Timeline; c: Colors }) {
  return (
    <Svg width={185} height={178} viewBox="70 150 370 355" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {COLUMNS.map(({ x, height, color, start }) => (
        <AnimatedPath
          key={x}
          d={time.interpolate({ inputRange: [start, start + 260], outputRange: [BAR(x, 10), BAR(x, height)], extrapolate: "clamp" })}
          fill={color}
          stroke="none"
          opacity={keyed(time, [[start - 1, 0], [start, 1]])}
        />
      ))}
      <AnimatedPath
        d={`M${ARROW_FROM[0]} ${ARROW_FROM[1]}C${ARROW_C1[0]} ${ARROW_C1[1]} ${ARROW_C2[0]} ${ARROW_C2[1]} ${ARROW_TO[0]} ${ARROW_TO[1]}`}
        stroke="#98da6a"
        strokeWidth={12}
        strokeDasharray={[ARROW_LENGTH, ARROW_LENGTH]}
        strokeDashoffset={between(time, 50, 1250, ARROW_LENGTH, 0, soft)}
      />
      <AnimatedPath d="M343 208 371 196 363 225" stroke="#98da6a" strokeWidth={12} opacity={keyed(time, [[1180, 0], [1330, 1]])} />
      <AnimatedG opacity={keyed(time, [[1720, 0], [1800, 1]])}>
        <Pivot x={399} y={177} scale={between(time, 1720, 1970, 0.2, 1, pop)}>
          <Path d={star(399, 177, 22, 10)} fill="#fcd34d" stroke="#fcd34d" strokeWidth={4} />
        </Pivot>
      </AnimatedG>
    </Svg>
  );
}

// ---- Budgets (3.2 s) ---------------------------------------------------------------------------------
// A banknote that flows like a ribbon in the wind: its outline is a quadrilateral whose long sides are curves, and the
// curves, the corners and the tilt change from frame to frame; a yellow ring appears small at the upper right, grows,
// goes down and to the left over the note and shrinks away at the lower left; the note keeps moving a little after it
// and settles. Every number is read from the recording, frame by frame (ui/budget-motion.ts, its pixels).
const NOTE_STROKE = 23;
const RING_STROKE = 25;
const CORNER_DISC = 25;
const arcCircle = (x: number, y: number, r: number) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const noteTimes = NOTE_FRAMES.map((row) => row[0]!);
const noteOutline = NOTE_FRAMES.map((row) => `M${row[1]} ${row[2]}C${row[3]} ${row[4]} ${row[5]} ${row[6]} ${row[7]} ${row[8]}L${row[9]} ${row[10]}C${row[11]} ${row[12]} ${row[13]} ${row[14]} ${row[15]} ${row[16]}Z`);
// The four round marks inside the corners (a little way from each corner toward the middle of the note).
const noteMarks = NOTE_FRAMES.map((row) => {
  const corners: Point[] = [[row[1]!, row[2]!], [row[7]!, row[8]!], [row[9]!, row[10]!], [row[15]!, row[16]!]];
  const mx = corners.reduce((sum, c) => sum + c[0], 0) / 4;
  const my = corners.reduce((sum, c) => sum + c[1], 0) / 4;
  return corners
    .map(([x, y]) => {
      const length = Math.hypot(mx - x, my - y) || 1;
      return arcCircle(Math.round(x + ((mx - x) / length) * CORNER_DISC), Math.round(y + ((my - y) / length) * CORNER_DISC), CORNER_DISC);
    })
    .join("");
});
const ringTimes = RING_FRAMES.map((row) => row[0]!);
// The ring goes round the note: its right half passes behind the note, its left half in front of it (seen on the
// recording). Each half is a half circle, drawn as the ring grows and moves.
const halfRing = (side: 0 | 1) =>
  RING_FRAMES.map((row) => {
    const r = Math.max(1, row[3]! - RING_STROKE / 2);
    return `M${row[1]} ${(row[2]! - r).toFixed(1)}A${r.toFixed(1)} ${r.toFixed(1)} 0 0 ${side} ${row[1]} ${(row[2]! + r).toFixed(1)}`;
  });
const ringBack = halfRing(1);
const ringFront = halfRing(0);
function Budgets({ time, c }: { time: Timeline; c: Colors }) {
  const line = (index: number) => keyed(time, NOTE_FRAMES.map((row) => [row[0]!, row[index]!] as Key));
  const first = ringTimes[0]!;
  const last = ringTimes[ringTimes.length - 1]!;
  const ringOpacity = keyed(time, [[first - 1, 0], [first, 1], [last, 1], [last + 1, 0]]);
  const half = (strings: string[]) => time.interpolate({ inputRange: ringTimes, outputRange: strings, extrapolate: "clamp" });
  return (
    <Svg width={310} height={200} viewBox="40 320 620 400" fill="none" strokeLinecap="butt" strokeLinejoin="round">
      <AnimatedPath d={half(ringBack)} stroke="#fbbf24" strokeWidth={RING_STROKE} opacity={ringOpacity} />
      <AnimatedG opacity={between(time, 0, 170, 0, 1)}>
        {/* The note has a paper of the screen's colour, so the half of the ring behind it is hidden under it. */}
        <AnimatedPath d={time.interpolate({ inputRange: noteTimes, outputRange: noteOutline, extrapolate: "clamp" })} fill={c.bg} stroke={c.positive} strokeWidth={NOTE_STROKE} strokeLinecap="round" />
        <AnimatedPath d={time.interpolate({ inputRange: noteTimes, outputRange: noteMarks, extrapolate: "clamp" })} fill={c.positive} stroke="none" />
        <AnimatedG translateX={line(17)} translateY={line(18)}>
          <AnimatedG rotation={line(19)}>
            <Ellipse cx={0} cy={0} rx={26} ry={35} fill={c.positive} />
          </AnimatedG>
        </AnimatedG>
      </AnimatedG>
      <AnimatedPath d={half(ringFront)} stroke="#fbbf24" strokeWidth={RING_STROKE} opacity={ringOpacity} />
    </Svg>
  );
}

// ---- Scheduled payments (1.9 s) ----------------------------------------------------------------------
// A calendar in a light circle with a thin ring around it: it rocks a little on its lower edge like a bell (the angle
// of every frame of the recording: about ±10°, then 5°, 2.5°, and it stands still after 2 s). The circle does not
// move. The colours come from the theme.
const SWING: ReadonlyArray<Key> = [[0,-1.0],[167,-6.5],[234,-8.6],[301,-10.0],[367,-8.0],[434,-4.0],[501,0.1],[568,4.4],[634,8.2],[701,9.6],[768,6.7],[835,2.9],[901,-1.1],[968,-4.5],[1035,-4.1],[1102,-1.5],[1168,1.2],[1235,3.7],[1302,4.8],[1368,2.5],[1435,0.0],[1502,-1.8],[1569,-2.4],[1635,-1.1],[1702,1.2],[1769,2.6],[1836,2.7],[1902,1.8],[1969,0.6],[2040,0.0]];
function Scheduled({ time, c }: { time: Timeline; c: Colors }) {
  const swing = keyed(time, SWING);
  const pin = mix(c.accent, c.bg, 0.4);
  const day = mix(c.muted, c.bg, 0.6);
  const square = (cx: number, cy: number, fill = day) => <Rect key={`${cx}-${cy}`} x={cx} y={cy} width={18} height={18} rx={2} fill={fill} />;
  return (
    <Svg width={190} height={190} viewBox="50 56 380 380">
      <Circle cx={240} cy={248} r={180} stroke={mix(c.accent, c.bg, 0.12)} strokeWidth={4} fill="none" />
      <Circle cx={240} cy={248} r={163} fill={mix(c.accent, c.bg, 0.16)} />
      <Pivot x={241} y={349} rotation={swing}>
        <Rect x={178} y={143} width={30} height={62} rx={15} fill={pin} />
        <Rect x={278} y={143} width={30} height={62} rx={15} fill={pin} />
        <Path d="M150 349V187A10 10 0 0 1 160 177H323A10 10 0 0 1 333 187V339A10 10 0 0 1 323 349H160A10 10 0 0 1 150 339Z" fill={c.bg} />
        <Path d="M150 212V187A10 10 0 0 1 160 177H323A10 10 0 0 1 333 187V212Z" fill={c.accent} />
        {[198, 230, 262, 294].map((x) => square(x, 230))}
        {[166, 230, 262, 294].map((x) => square(x, 262))}
        {square(198, 262, c.positive)}
        {[166, 198, 230, 262].map((x) => square(x, 293))}
      </Pivot>
    </Svg>
  );
}

// ---- The block -------------------------------------------------------------------------------------

export function EmptyState({ kind, title, hint, action, onAction }: { kind: EmptyKind; title: string; hint: string; action?: string; onAction?: () => void }): ReactNode {
  const p = usePalette();
  const t = useT();
  const total = PLAY_MS[kind];
  const opened = useRef(Date.now()).current;
  const since = REPLAYS.has(kind) ? opened : (firstShown[kind] ??= Date.now());
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
