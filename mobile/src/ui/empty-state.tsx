// Empty states (js/ui/empty-state.js and css/empty-state.css): a picture with a title, a hint and, where the
// person can start, a button. One component for every list that can be empty. A picture plays only while its screen
// is shown: it starts from the first frame at every visit, two frames and 150 ms after the screen was drawn (so the
// tab's own first frame and a quick pass through the tabs do not compete with it), and stops at rest when the screen is
// left. After the person has done something in this launch (ui/quiet.ts) the pictures are drawn at rest.
import { useCallback, useRef, type ReactNode } from "react";
import { useFocusEffect } from "expo-router";
import { Animated, Easing, View, Text } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { NOTE_MARKS, NOTE_OUTLINE, NOTE_STROKE, NOTE_TIMES, RING_BACK, RING_FRAMES, RING_FRONT } from "./budget-motion.ts";
import { usePalette, useT } from "./app-context.tsx";
import { Button } from "./kit.tsx";
import { mix } from "./theme.ts";
import { Pivot } from "./svg-pivot.tsx";
import { markPlayed, shouldPlay } from "./quiet.ts";
import { onPictureStop } from "./picture-stop.ts";

export type EmptyKind = "operations" | "accounts" | "categories" | "budgets" | "scheduled" | "statistics";

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
// How long each picture plays (ms), taken from the first application's recordings (frame by frame, 2026-11-22): the
// time from the picture's first frame to its last movement.
const PLAY_MS: Record<EmptyKind, number> = { operations: 4950, accounts: 3000, categories: 1400, budgets: 3200, scheduled: 1400, statistics: 2100 };

const START_WAIT_MS = 150;

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

// ---- Operations (4.9 s) ------------------------------------------------------------------------------
// A sheet of paper (its top corner rolled over, its bottom curled up), its lines drawn one after another, and a lens
// that pops in, settles over the sheet, turns about 32° the way a hand holds it, goes up and left, waits, goes down
// along the sheet's edge, waits, and comes back to rest. Its cross grows from a dot, and turns with the lens, so it
// looks like a plus while the lens is turned and like an x at rest. Every number is read from the recording (30 fps):
// [time ms, shift x, shift y, turn of the lens in degrees].
const LENS: ReadonlyArray<ReadonlyArray<number>> = [[0,21,29,-2],[403,21,28,-2.6],[470,21,28,-2.6],[537,20,28,-2.6],[603,18,24,-2.5],[670,13,17,-1.9],[737,10,12,-1.2],[803,8,10,-0.7],[870,7,8,-0.4],[937,6,7,-0.1],[1003,5,6,-0.1],[1070,5,6,0.7],[1137,4,5,1.0],[1203,4,5,1.0],[1270,4,5,1.0],[1337,4,4,0.9],[1403,3,4,0.1],[1470,1,2,-2.3],[1537,-5,-3,-7.8],[1603,-13,-10,-14.4],[1670,-18,-13,-19.0],[1737,-21,-16,-22.3],[1803,-24,-18,-24.7],[1870,-26,-19,-26.6],[1937,-27,-20,-28.0],[2003,-28,-21,-29.2],[2070,-29,-22,-30.0],[2137,-29,-22,-30.5],[2203,-30,-23,-31.0],[2270,-30,-23,-31.5],[2337,-31,-23,-31.9],[2403,-31,-23,-32.1],[2470,-31,-23,-32.3],[2537,-31,-23,-32.4],[2603,-31,-23,-32.4],[2670,-31,-22,-32.2],[2737,-31,-16,-31.8],[2803,-31,-4,-31.6],[2870,-31,12,-32.0],[2937,-31,22,-33.3],[3003,-31,29,-34.7],[3070,-31,34,-37.2],[3137,-31,38,-38.7],[3203,-31,41,-39.4],[3270,-31,44,-39.8],[3337,-31,46,-40.0],[3403,-31,47,-40.4],[3470,-31,48,-40.2],[3537,-31,49,-40.5],[3603,-31,50,-40.5],[3670,-31,50,-40.4],[3737,-31,50,-40.5],[3803,-31,50,-40.2],[3870,-30,49,-37.9],[3937,-27,43,-30.5],[4003,-20,32,-19.1],[4070,-14,22,-12.1],[4137,-10,15,-8.5],[4203,-7,11,-6.0],[4270,-5,8,-4.5],[4337,-4,5,-3.3],[4403,-3,4,-2.4],[4470,-2,3,-1.5],[4537,-1,1,-0.9],[4603,-1,1,-0.5],[4670,0,0,-0.2],[4737,0,0,-0.0],[4803,0,0,-0.0],[4870,0,0,-0.0],[4970,0,0,0]];
function Operations({ time, c }: { time: Timeline; c: Colors }) {
  const dark = c.muted;
  const faint = mix(c.muted, c.bg, 0.45);
  const lensColor = mix(c.muted, c.bg, 0.62);
  const lens = (index: number) => keyed(time, LENS.map((row) => [row[0]!, row[index]!] as Key));
  const lines: ReadonlyArray<readonly [number, number]> = [[225, 433], [275, 405], [329, 351], [380, 351]];
  return (
    <Svg width={170} height={170} viewBox="200 155 340 340" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <AnimatedG opacity={between(time, 0, 50, 0, 1)}>
        <Path d="M248 215A48 48 0 0 1 296 167H466M466 226V440M248 215V286M248 295V301M248 330V430" stroke={dark} strokeWidth={6} />
        <Path d="M463 226V167H497A31 31 0 0 1 528 198V218A8 8 0 0 1 520 226Z" fill={dark} stroke="none" />
        <Path d="M222 430H393C393 462 408 476 432 476C450 476 462 462 462 440H470C470 468 452 488 430 488H222A14 14 0 0 1 208 474V444A14 14 0 0 1 222 430Z" fill={dark} stroke="none" />
      </AnimatedG>
      {lines.map(([ly, to], i) => {
        const length = to - 290;
        return <AnimatedPath key={ly} d={`M290 ${ly}H${to}`} stroke={faint} strokeWidth={6} strokeDasharray={[length, length]} strokeDashoffset={between(time, 40 + i * 70, 400 + i * 70, length, 0, out)} />;
      })}
      <AnimatedG opacity={between(time, 0, 60, 0, 1)} translateX={lens(1)} translateY={lens(2)}>
        <Pivot x={459} y={314} rotation={lens(3)} scale={keyed(time, [[0, 0.6], [170, 1, out], [400, 1.115], [740, 1.04], [1070, 1.005], [1300, 1]])}>
          <Circle cx={459} cy={314} r={62} fill={c.bg} stroke={lensColor} strokeWidth={6} />
          <Path d="M493 372L522 407" stroke={lensColor} strokeWidth={13} />
          <Pivot x={459} y={314} scale={keyed(time, [[150, 0.02], [300, 0.3], [500, 0.75], [700, 0.93], [1070, 1]])}>
            <Pivot x={459} y={314} rotation={45}>
              <Path d="M429 314H489M459 284V344" stroke={c.accent} strokeWidth={6} />
            </Pivot>
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

// ---- Statistics (2.1 s) ------------------------------------------------------------------------------
// Six bars grow from the ground one after another from left to right (each a little past its height, then back), the
// arrow is drawn from the lower left along their tops all the time they grow, ending over the last one, and a star
// pops up over the last bar. Moments and heights are read from the recording frame by frame (30 fps).
const GROUND = 485;
const COLUMNS: ReadonlyArray<{ x: number; height: number; color: string; start: number }> = [
  { x: 88, height: 49, color: "#f19e42", start: 130 },
  { x: 146, height: 81, color: "#f7d14f", start: 350 },
  { x: 205, height: 119, color: "#96cb64", start: 550 },
  { x: 263, height: 159, color: "#48cf97", start: 750 },
  { x: 322, height: 205, color: "#3390e9", start: 1000 },
  { x: 380, height: 260, color: "#6b37fe", start: 1200 },
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
        <Pivot key={x} x={x} y={GROUND} scaleY={keyed(time, [[start - 1, 0.001], [start, 0.001], [start + 300, 1.1, out], [start + 520, 1, soft]])}>
          <Path d={BAR(x, height)} fill={color} stroke="none" />
        </Pivot>
      ))}
      <AnimatedPath
        d={`M${ARROW_FROM[0]} ${ARROW_FROM[1]}C${ARROW_C1[0]} ${ARROW_C1[1]} ${ARROW_C2[0]} ${ARROW_C2[1]} ${ARROW_TO[0]} ${ARROW_TO[1]}`}
        stroke="#98da6a"
        strokeWidth={12}
        strokeDasharray={[ARROW_LENGTH, ARROW_LENGTH]}
        strokeDashoffset={between(time, 0, 1450, ARROW_LENGTH, 0)}
      />
      <AnimatedPath d="M343 208 371 196 363 225" stroke="#98da6a" strokeWidth={12} opacity={keyed(time, [[1250, 0], [1450, 1]])} />
      <AnimatedG opacity={keyed(time, [[1860, 0], [1900, 1]])}>
        <Pivot x={399} y={177} scale={between(time, 1860, 2060, 0.5, 1, pop)}>
          <Path d={star(399, 177, 22, 10)} fill="#fcd34d" stroke="#fcd34d" strokeWidth={4} />
        </Pivot>
      </AnimatedG>
    </Svg>
  );
}

// ---- Budgets (3.2 s) ---------------------------------------------------------------------------------
// A banknote that flows like a ribbon in the wind: its frame is a stroke along a closed line of two curved long edges and
// two straight short ones, with four half discs on the inner side of the edges and an ellipse in the middle; all of it is
// built from the frame's own edges in every frame (ui/budget-motion.ts, made by scripts/gen-budget-motion.py), so the
// marks bend with the frame. A yellow ring appears small at the upper right, grows, goes down and to the left through the
// note and shrinks away at the lower left; the note keeps moving a little after it and settles. The note is transparent
// (only its outline and marks are painted), as in the recording.
const RING_STROKE = 25;
const ringTimes = RING_FRAMES.map((row) => row[0]!);
// The ring goes through the note: measured at every crossing of the ring with an edge of the note in the recording, the
// ring's upper right part lies behind the note's frame and the rest of the circle in front of it. The crossings move with
// the note, so where the ring is split is found per frame (scripts/gen-budget-motion.py: RING_BACK, RING_FRONT) at a free
// place between the strokes, never across one. The back arc is drawn first, then the note, then the front arc.
function Budgets({ time, c }: { time: Timeline; c: Colors }) {
  const first = ringTimes[0]!;
  const last = ringTimes[ringTimes.length - 1]!;
  const ringOpacity = keyed(time, [[first - 1, 0], [first, 1], [last, 1], [last + 1, 0]]);
  const blend = (inputRange: ReadonlyArray<number>, outputRange: ReadonlyArray<string>) => time.interpolate({ inputRange: [...inputRange], outputRange: [...outputRange], extrapolate: "clamp" });
  return (
    <Svg width={310} height={200} viewBox="40 320 620 400" fill="none" strokeLinecap="butt" strokeLinejoin="round">
      <AnimatedPath d={blend(ringTimes, RING_BACK)} stroke="#fbbf24" strokeWidth={RING_STROKE} opacity={ringOpacity} />
      <AnimatedG opacity={between(time, 0, 170, 0, 1)}>
        <AnimatedPath d={blend(NOTE_TIMES, NOTE_OUTLINE)} fill="none" stroke={c.positive} strokeWidth={NOTE_STROKE} strokeLinecap="round" strokeLinejoin="round" />
        <AnimatedPath d={blend(NOTE_TIMES, NOTE_MARKS)} fill={c.positive} stroke="none" />
      </AnimatedG>
      <AnimatedPath d={blend(ringTimes, RING_FRONT)} stroke="#fbbf24" strokeWidth={RING_STROKE} opacity={ringOpacity} />
    </Svg>
  );
}

// ---- Scheduled payments (1.4 s) ----------------------------------------------------------------------
// A calendar in a light circle with a thin ring around it, shaken like a phone in the hand (the owner, 2026-11-23: the
// recording's slow rocking did not feel like shaking): two bursts, each dying down, about its own centre. Burst one
// swings 12°, 11°, 9°, 7°, 5°, 3°, 1.5° at 70 ms per half swing, a pause, burst two at about 60 %; the calendar also
// shifts a little sideways in phase. The circle does not move. The calendar is a view turned and moved on the native
// driver (every frame of a fast shake counts, and the JavaScript thread may be busy building a tab); the colours come
// from the theme.
const SHAKE: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [70, 12], [140, -11], [210, 9], [280, -7], [350, 5], [420, -3], [490, 1.5], [560, 0],
  [810, 0], [880, 7], [950, -6], [1020, 4.5], [1090, -3], [1160, 2], [1230, -1], [1300, 0], [1400, 0],
];
const SHAKE_SHIFT = 3; // px at the largest angle (12°)
function Scheduled({ time, c }: { time: Timeline; c: Colors }) {
  // Linear in time, shaped by a sine between the keys so that the calendar slows at the turning points like a body does.
  const keys = SHAKE.flatMap(([at, deg], i) => (i ? Array.from({ length: 6 }, (_, k) => {
    const prev = SHAKE[i - 1]!;
    const f = (k + 1) / 6;
    return [prev[0] + (at - prev[0]) * f, prev[1] + (deg - prev[1]) * soft(f)] as const;
  }) : [[at, deg] as const]));
  const input = keys.map((k) => k[0]);
  const rotate = time.interpolate({ inputRange: input, outputRange: keys.map((k) => `${k[1]}deg`), extrapolate: "clamp" });
  const shift = time.interpolate({ inputRange: input, outputRange: keys.map((k) => (k[1] / 12) * SHAKE_SHIFT), extrapolate: "clamp" });
  const pin = mix(c.accent, c.bg, 0.4);
  const day = mix(c.muted, c.bg, 0.6);
  const square = (cx: number, cy: number, fill = day) => <Rect key={`${cx}-${cy}`} x={cx} y={cy} width={18} height={18} rx={2} fill={fill} />;
  // The point (241, 263) of the drawing (the middle of the calendar's body) in the view's own pixels (the drawing is
  // 380 units wide shown 190 px wide, from (50, 56)).
  const origin = `${(241 - 50) / 2}px ${(263 - 56) / 2}px`;
  return (
    <View style={{ width: 190, height: 190 }}>
      <Svg width={190} height={190} viewBox="50 56 380 380">
        <Circle cx={240} cy={248} r={180} stroke={mix(c.accent, c.bg, 0.12)} strokeWidth={4} fill="none" />
        <Circle cx={240} cy={248} r={163} fill={mix(c.accent, c.bg, 0.16)} />
      </Svg>
      <Animated.View style={{ position: "absolute", left: 0, top: 0, width: 190, height: 190, transform: [{ translateX: shift }, { rotate }], transformOrigin: origin }}>
        <Svg width={190} height={190} viewBox="50 56 380 380">
          <Rect x={178} y={143} width={30} height={62} rx={15} fill={pin} />
          <Rect x={278} y={143} width={30} height={62} rx={15} fill={pin} />
          <Path d="M150 349V187A10 10 0 0 1 160 177H323A10 10 0 0 1 333 187V339A10 10 0 0 1 323 349H160A10 10 0 0 1 150 339Z" fill={c.bg} />
          <Path d="M150 212V187A10 10 0 0 1 160 177H323A10 10 0 0 1 333 187V212Z" fill={c.accent} />
          {[198, 230, 262, 294].map((x) => square(x, 230))}
          {[166, 230, 262, 294].map((x) => square(x, 262))}
          {square(198, 262, c.positive)}
          {[166, 198, 230, 262].map((x) => square(x, 293))}
        </Svg>
      </Animated.View>
    </View>
  );
}

// ---- The block -------------------------------------------------------------------------------------

export function EmptyState({ kind, title, hint, action, onAction }: { kind: EmptyKind; title: string; hint: string; action?: string; onAction?: () => void }): ReactNode {
  const p = usePalette();
  const t = useT();
  const total = PLAY_MS[kind];
  const time = useRef(new Animated.Value(shouldPlay(kind) ? 0 : total)).current;
  // Played only while the screen is in focus. `freezeOnBlur` freezes React rendering, not an `Animated` loop, so an
  // animation started on mount went on behind a tab that was left (and, JS-driven, kept the JavaScript thread busy while
  // the next tab was being built).
  useFocusEffect(
    useCallback(() => {
      if (!shouldPlay(kind)) return void time.setValue(total);
      time.setValue(0);
      let run: Animated.CompositeAnimation | undefined;
      let second = 0;
      let wait: ReturnType<typeof setTimeout> | undefined;
      // Two frames after the screen is drawn, then a short wait: a person who taps through the tabs leaves a tab before
      // the wait is over, and no picture is started (and stopped again) for a tab that was only passed through (the
      // empty-profile tab moves of CI, build 133: 9 s of JavaScript time in twelve quick taps, pictures on the JS driver).
      const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => {
          wait = setTimeout(() => {
            markPlayed(kind);
            run = Animated.timing(time, { toValue: total, duration: total, easing: Easing.linear, useNativeDriver: kind === "scheduled" });
            run.start();
          }, START_WAIT_MS);
        });
      });
      // Stops the picture and leaves it at rest; also called by a press on a tab (ui/picture-stop.ts).
      const stop = () => {
        cancelAnimationFrame(first);
        cancelAnimationFrame(second);
        if (wait) clearTimeout(wait);
        run?.stop();
        time.setValue(total);
      };
      const forget = onPictureStop(stop);
      return () => {
        forget();
        stop();
      };
    }, [time, total, kind]),
  );
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
