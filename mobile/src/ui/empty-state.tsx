// Empty states (js/ui/empty-state.js and css/empty-state.css): a picture with a title, a hint and, where the
// person can start, a button. One component for every list that can be empty. A picture plays only while its screen
// is shown: it starts from the first frame at every visit, two frames and 150 ms after the screen was drawn (so the
// tab's own first frame and a quick pass through the tabs do not compete with it), and stops at rest when the screen is
// left. After the person has done something in this launch (ui/quiet.ts) the pictures are drawn at rest.
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useFocusEffect } from "expo-router";
import { Animated, Easing, View, Text } from "react-native";
import Reanimated, { cancelAnimation, Easing as ReEasing, Extrapolation, interpolate, makeMutable, useAnimatedProps, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { NOTE_MARKS, NOTE_OUTLINE, NOTE_STROKE, NOTE_TIMES, RING_BACK, RING_FRAMES, RING_FRONT } from "./budget-motion.ts";
import { expand, type Ease, type Key } from "./keys.ts";
import { numberTrack, pathTrack } from "./path-track.ts";
import { PAPER_FILLS, PAPER_LINES, PAPER_STROKES } from "./operations-paper.ts";
import { usePalette, useT } from "./app-context.tsx";
import { Button } from "./kit.tsx";
import { mix } from "./theme.ts";
import { Pivot } from "./svg-pivot.tsx";
import { markPlayed, onActed, shouldPlay } from "./quiet.ts";
import { onPictureStop } from "./picture-stop.ts";

type EmptyKind = "operations" | "accounts" | "categories" | "budgets" | "scheduled" | "statistics";

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
// How long each picture plays (ms), taken from the first application's recordings (frame by frame, 2026-11-22): the
// time from the picture's first frame to its last movement.
const PLAY_MS: Record<EmptyKind, number> = { operations: 4950, accounts: 3000, categories: 1400, budgets: 3200, scheduled: 1400, statistics: 2100 };

// After the first frame is on the screen the run starts at once (one frame, then this wait: a person who taps through tabs
// quickly leaves a tab before it is over, and no picture is started for a tab that was only passed through).
const START_WAIT_MS = 50;
// The reset to the first frame after a screen was left waits this long (a frozen tab is not drawn meanwhile).
const RESET_WAIT_MS = 400;

type Timeline = Animated.Value;
function keyed(time: Timeline, keys: ReadonlyArray<Key>) {
  const { input, output } = expand(keys);
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
// that pops in, settles over the sheet, turns about 36° the way a hand holds it, goes up and left, waits, goes down
// along the sheet's edge, waits, and comes back to rest. Its cross grows from a dot, and turns with the lens, so it
// looks like a plus while the lens is turned and like an x at rest. Every number is read from the recording (30 fps):
// [time ms from the first frame of the picture, shift x, shift y, turn of the lens in degrees]; the turn is that of the cross (it
// is always inside the lens, the handle is hidden by the sheet for a while). Refitted in 0.3.10 from every frame.
const LENS: ReadonlyArray<ReadonlyArray<number>> = [[0,38.8,45.3,0],[33,32.8,43,0],[67,29.4,39,0],[100,25,34.6,0],[167,22.5,30.3,0],[300,20.7,27,0],[533,19.8,25.6,0],[600,17.5,22.5,0],[667,12.6,16.1,0],[733,9.4,12,0],[867,6.4,8,0],[1133,4.2,5,0],[1367,3.6,4.4,0],[1433,2,3.1,-2],[1500,-2.2,-0.3,-5.8],[1600,-13.2,-8.8,-16.8],[1667,-18.3,-12.7,-21.8],[1733,-21.8,-15.2,-25.6],[1900,-26.9,-18.9,-30.6],[2133,-30.2,-21.3,-34.3],[2533,-31.9,-22.5,-35.9],[2633,-32,-21.9,-36],[2700,-31.9,-18.8,-36],[2733,-31.9,-15.5,-35.9],[2767,-31.9,-10.2,-36],[2867,-32,12.6,-36],[2900,-32,18.4,-36],[2967,-31.9,27,-35.8],[3067,-32,35.4,-35.9],[3200,-32,42.3,-35.9],[3367,-32,47.3,-35.9],[3600,-32,50.6,-36],[3800,-31.9,51.1,-35.7],[3867,-30.9,49.6,-34],[3900,-29.8,47.6,-32.2],[3933,-27.8,44.3,-29.1],[3967,-24.7,39.1,-24.9],[4033,-17.2,26.8,-17.4],[4067,-14.4,22.1,-14.3],[4133,-10.3,15.5,-10.5],[4233,-6.5,9.5,-6.7],[4400,-2.8,4,-2.7],[4567,-1,1.3,-0.9],[4867,-0,0,-0.2],[4967,-0,0,-0.1]];
const LENS_SCALE: ReadonlyArray<Key> = [[0, 0.83],[33, 0.853],[100, 0.987],[167, 1.055],[300, 1.107],[500, 1.121],[600, 1.101],[733, 1.044],[1067, 1.006],[4967, 1.003]];
const CROSS_SCALE: ReadonlyArray<Key> = [[0, 0],[67, 0],[100, 0.33],[233, 0.383],[400, 0.71],[767, 0.955],[1833, 1],[4967, 1]];
const LINE_DRAW: ReadonlyArray<ReadonlyArray<Key>> = [[[0, 125.0], [33, 125.0], [67, 115.0], [100, 95.0], [133, 70.0], [167, 52.0], [200, 39.0], [233, 29.0], [300, 16.0], [367, 8.0], [433, 2.0], [467, 0.0], [1500, 0.0]], [[0, 99.5], [33, 99.5], [67, 89.5], [100, 69.5], [133, 44.5], [167, 26.5], [200, 13.5], [233, 3.5], [267, 0.0], [1500, 0.5]], [[100, 51.0], [133, 51.0], [167, 49.0], [200, 45.0], [267, 26.0], [333, 13.0], [433, 4.0], [533, 0.0], [1500, 0.0]], [[167, 51.5], [200, 51.5], [233, 49.5], [267, 45.5], [333, 26.5], [367, 19.5], [433, 10.5], [500, 4.5], [600, 0.5], [1500, 0.0]]];
// Operations and Statistics run on the UI thread (Reanimated): the clock is a shared value, every moving part reads it in a
// worklet and writes its own props there, so the JavaScript thread does nothing while the picture plays (0.3.15, emulator:
// 2.7 s and 2.0 s of JavaScript busy over 3.5 s with the Animated driver). Only props the native shapes take as they are
// (opacity, d, stroke width, dash offset, centre and radius) are animated: a turn or a scale is worked out in the worklet and
// written as the shape's own geometry, never as a transform prop (a transform prop goes through a JavaScript step on the shape).
type Clock2 = SharedValue<number>;
type Spec = ReturnType<typeof expand>;
const specOf = (keys: ReadonlyArray<Key>): Spec => expand(keys);
const at = (t: number, s: Spec): number => {
  "worklet";
  return interpolate(t, s.input, s.output, Extrapolation.CLAMP);
};
const RG = Reanimated.createAnimatedComponent(G);
const RPath = Reanimated.createAnimatedComponent(Path);
const RCircle = Reanimated.createAnimatedComponent(Circle);

function Fade({ time, spec, children }: { time: Clock2; spec: Spec; children: ReactNode }) {
  const props = useAnimatedProps(() => ({ opacity: at(time.value, spec) }));
  return <RG animatedProps={props}>{children}</RG>;
}

const OPS_FADE_PAPER = specOf([[0, 0], [50, 1]]);
const OPS_FADE_LENS = specOf([[0, 0], [60, 1]]);
const OPS_LINES = PAPER_LINES.map((_, i) => {
  const draw = LINE_DRAW[i]!;
  return { draw: specOf(draw), appear: specOf([[draw[0]![0] - 1, 0], [draw[0]![0], 1]]) };
});
const LENS_X = specOf(LENS.map((row) => [row[0]!, row[1]!] as Key));
const LENS_Y = specOf(LENS.map((row) => [row[0]!, row[2]!] as Key));
const LENS_TURN = specOf(LENS.map((row) => [row[0]!, row[3]!] as Key));
const LENS_ZOOM = specOf(LENS_SCALE);
const CROSS_ZOOM = specOf(CROSS_SCALE);
const LENS_CX = 459;
const LENS_CY = 314;

function OpsLine({ time, d, length, color, index }: { time: Clock2; d: string; length: number; color: string; index: number }) {
  const line = OPS_LINES[index]!;
  const props = useAnimatedProps(() => ({ strokeDashoffset: at(time.value, line.draw), opacity: at(time.value, line.appear) }));
  return <RPath animatedProps={props} d={d} stroke={color} strokeWidth={7.5} strokeDasharray={[length, length]} />;
}

// The lens: its circle, handle and cross, each turned and scaled about (459, 314) and moved, the cross first scaled on its own
// and turned 45° inside the lens (the order of the nested groups of the Animated version).
function OpsLens({ time, c }: { time: Clock2; c: Colors }) {
  const lensColor = mix(c.muted, c.bg, 0.62);
  const circle = useAnimatedProps(() => {
    const t = time.value;
    const s = at(t, LENS_ZOOM);
    return { cx: LENS_CX + at(t, LENS_X), cy: LENS_CY + at(t, LENS_Y), r: 62 * s, strokeWidth: 6 * s };
  });
  const handle = useAnimatedProps(() => {
    const t = time.value;
    const s = at(t, LENS_ZOOM);
    const a = (at(t, LENS_TURN) * Math.PI) / 180;
    const cos = Math.cos(a) * s;
    const sin = Math.sin(a) * s;
    const tx = LENS_CX + at(t, LENS_X);
    const ty = LENS_CY + at(t, LENS_Y);
    const x1 = tx + cos * (493 - LENS_CX) - sin * (372 - LENS_CY);
    const y1 = ty + sin * (493 - LENS_CX) + cos * (372 - LENS_CY);
    const x2 = tx + cos * (522 - LENS_CX) - sin * (407 - LENS_CY);
    const y2 = ty + sin * (522 - LENS_CX) + cos * (407 - LENS_CY);
    return { d: `M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`, strokeWidth: 13 * s };
  });
  const cross = useAnimatedProps(() => {
    const t = time.value;
    const s = at(t, LENS_ZOOM);
    const k = at(t, CROSS_ZOOM);
    const a = (at(t, LENS_TURN) * Math.PI) / 180;
    const cos = Math.cos(a) * s;
    const sin = Math.sin(a) * s;
    const tx = LENS_CX + at(t, LENS_X);
    const ty = LENS_CY + at(t, LENS_Y);
    // The plus (±30) turned 45° inside, scaled by k: its four ends are (±r, ±r) · k with r = 30 / √2... written as the turned points.
    const h = (30 * Math.SQRT1_2) * k;
    const pts: number[][] = [[-h, -h], [h, h], [h, -h], [-h, h]];
    let d = "";
    for (let i = 0; i < 4; i++) {
      const dx = pts[i]![0]!;
      const dy = pts[i]![1]!;
      d += `${i % 2 ? "L" : "M"}${(tx + cos * dx - sin * dy).toFixed(2)} ${(ty + sin * dx + cos * dy).toFixed(2)}`;
    }
    return { d, strokeWidth: 6 * k * s };
  });
  return (
    <Fade time={time} spec={OPS_FADE_LENS}>
      <RCircle animatedProps={circle} cx={LENS_CX} cy={LENS_CY} r={62} fill={c.bg} stroke={lensColor} strokeWidth={6} />
      <RPath animatedProps={handle} d="M493 372L522 407" stroke={lensColor} strokeWidth={13} />
      <RPath animatedProps={cross} d="M429 314H489M459 284V344" stroke={c.accent} strokeWidth={6} />
    </Fade>
  );
}

function Operations({ time, c }: { time: Clock2; c: Colors }) {
  const dark = c.muted;
  const faint = mix(c.muted, c.bg, 0.45);
  return (
    <Svg width={191} height={170} viewBox="179 155 382 340" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {/* The sheet (scripts/trace-operations-paper.py): the outline is straight strokes of constant width with round caps and
          one quarter circle, each ending inside the fill it meets; the top curl and the bottom roll are the only filled shapes. */}
      <Fade time={time} spec={OPS_FADE_PAPER}>
        {PAPER_FILLS.map((d, i) => (
          <Path key={i} d={d} fill={dark} stroke="none" />
        ))}
        {PAPER_STROKES.map(([d, width], i) => (
          <Path key={i} d={d} stroke={dark} strokeWidth={width} fill="none" />
        ))}
      </Fade>
      {/* Measured on every frame of the recording: the first two lines are drawn together, the others follow; a line not yet
          started is not shown (a round cap would show as a dot). */}
      {PAPER_LINES.map(([ly, from, to], i) => (
        <OpsLine key={ly} time={time} d={`M${from} ${ly}H${to}`} length={to - from} color={faint} index={i} />
      ))}
      <OpsLens time={time} c={c} />
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
const BAR_GROW = COLUMNS.map(({ start }) => specOf([[start - 1, 0.001], [start, 0.001], [start + 300, 1.1, out], [start + 520, 1, soft]]));
const ARROW_DRAW = specOf([[0, ARROW_LENGTH], [1450, 0]]);
const ARROW_HEAD = specOf([[1250, 0], [1450, 1]]);
const STAR_FADE = specOf([[1860, 0], [1900, 1]]);
const STAR_GROW = specOf([[1860, 0.5], [2060, 1, pop]]);

// A bar grows from the ground: its path scaled in y about the ground line (the corner arcs get the same scale, as under a scale
// transform), written as the path itself.
function Bar({ time, x, height, color, index }: { time: Clock2; x: number; height: number; color: string; index: number }) {
  const grow = BAR_GROW[index]!;
  const props = useAnimatedProps(() => {
    const k = at(time.value, grow);
    const top = GROUND - k * height;
    const shoulder = GROUND - k * (height - 10);
    return { d: `M${x} ${GROUND}V${shoulder.toFixed(2)}A10 ${(10 * k).toFixed(3)} 0 0 1 ${x + 10} ${top.toFixed(2)}H${x + 30}A10 ${(10 * k).toFixed(3)} 0 0 1 ${x + 40} ${shoulder.toFixed(2)}V${GROUND}Z` };
  });
  return <RPath animatedProps={props} d={BAR(x, height)} fill={color} stroke="none" />;
}

function Arrow({ time }: { time: Clock2 }) {
  const line = useAnimatedProps(() => ({ strokeDashoffset: at(time.value, ARROW_DRAW) }));
  const head = useAnimatedProps(() => ({ opacity: at(time.value, ARROW_HEAD) }));
  return (
    <>
      <RPath
        animatedProps={line}
        d={`M${ARROW_FROM[0]} ${ARROW_FROM[1]}C${ARROW_C1[0]} ${ARROW_C1[1]} ${ARROW_C2[0]} ${ARROW_C2[1]} ${ARROW_TO[0]} ${ARROW_TO[1]}`}
        stroke="#98da6a"
        strokeWidth={12}
        strokeDasharray={[ARROW_LENGTH, ARROW_LENGTH]}
      />
      <RPath animatedProps={head} d="M343 208 371 196 363 225" stroke="#98da6a" strokeWidth={12} />
    </>
  );
}

// The star pops in: its path and stroke scaled about its centre.
function PopStar({ time }: { time: Clock2 }) {
  const props = useAnimatedProps(() => {
    const k = at(time.value, STAR_GROW);
    let d = "";
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = (i % 2 ? 10 : 22) * k;
      d += `${i ? "L" : "M"}${(399 + r * Math.cos(angle)).toFixed(2)} ${(177 + r * Math.sin(angle)).toFixed(2)}`;
    }
    return { d: d + "Z", strokeWidth: 4 * k };
  });
  return (
    <Fade time={time} spec={STAR_FADE}>
      <RPath animatedProps={props} d={star(399, 177, 22, 10)} fill="#fcd34d" stroke="#fcd34d" strokeWidth={4} />
    </Fade>
  );
}

function Statistics({ time }: { time: Clock2; c: Colors }) {
  return (
    <Svg width={185} height={178} viewBox="70 150 370 355" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {COLUMNS.map(({ x, height, color }, i) => (
        <Bar key={x} time={time} x={x} height={height} color={color} index={i} />
      ))}
      <Arrow time={time} />
      <PopStar time={time} />
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
const ringTimes = RING_FRAMES.map((row) => row[0]!);
// The ring's thickness changes (about 6 px at its first frame, over 30 at its widest, 22 at its narrowest, a thin ring again
// at the end): RING_FRAMES holds it as the fifth number of every row, and the ring is a path on the middle radius drawn with
// that stroke width, so the first and the last frame are real rings with a hole.
// The ring goes through the note. The back layer is the whole circle under the note, whose opaque fill and stroke hide it
// wherever it runs behind the note; the front layer holds only the runs of the circle that lie in front of the note (found per
// frame from the note's own outline, scripts/gen-budget-motion.py: RING_BACK, RING_FRONT) and is drawn over it.
// The paths are not Animated interpolations (they re-read every number of four long strings on every tick): each is a track
// over numbers parsed once (path-track.ts), and a listener of the clock writes the shown frame to the four shapes with
// setNativeProps, only while a ring or the note is on the screen. The opacities stay Animated (two numbers).
const NOTE_TRACK = pathTrack(NOTE_TIMES, NOTE_OUTLINE);
const MARKS_TRACK = pathTrack(NOTE_TIMES, NOTE_MARKS);
const BACK_TRACK = pathTrack(ringTimes, RING_BACK);
const FRONT_TRACK = pathTrack(ringTimes, RING_FRONT);
const RING_WIDTH = numberTrack(ringTimes, RING_FRAMES.map((row) => row[4]!));
type Shape = { setNativeProps(props: object): void };
function Budgets({ time, c }: { time: Timeline; c: Colors }) {
  const first = ringTimes[0]!;
  const last = ringTimes[ringTimes.length - 1]!;
  const ringOpacity = keyed(time, [[first - 1, 0], [first, 1], [last, 1], [last + 1, 0]]);
  const back = useRef<Shape | null>(null);
  const note = useRef<Shape | null>(null);
  const marks = useRef<Shape | null>(null);
  const front = useRef<Shape | null>(null);
  const now = (time as unknown as { __getValue(): number }).__getValue();
  useEffect(() => {
    const draw = (t: number) => {
      // The ring is invisible before its first frame and after its last one; the note holds its last shape afterwards.
      if (t >= first - 1 && t <= last + 1) {
        const width = RING_WIDTH(t);
        back.current?.setNativeProps({ d: BACK_TRACK(t), strokeWidth: width });
        front.current?.setNativeProps({ d: FRONT_TRACK(t), strokeWidth: width });
      }
      if (t >= NOTE_TIMES[0]! - 1) {
        note.current?.setNativeProps({ d: NOTE_TRACK(t) });
        marks.current?.setNativeProps({ d: MARKS_TRACK(t) });
      }
    };
    const id = time.addListener(({ value }) => draw(value));
    draw((time as unknown as { __getValue(): number }).__getValue()); // it may have moved since the render (a reset or a restart)
    return () => time.removeListener(id);
  }, [time, first, last]);
  return (
    <Svg width={310} height={200} viewBox="40 320 620 400" fill="none" strokeLinecap="butt" strokeLinejoin="round">
      <AnimatedG opacity={ringOpacity}>
        <Path ref={back as never} d={BACK_TRACK(now)} stroke="#fbbf24" strokeWidth={RING_WIDTH(now)} />
      </AnimatedG>
      {/* Opaque: the note is filled with the screen's colour, so the part of the ring behind it is hidden by the note itself. */}
      <AnimatedG opacity={between(time, 0, 170, 0, 1)}>
        <Path ref={note as never} d={NOTE_TRACK(now)} fill={c.bg} stroke={c.positive} strokeWidth={NOTE_STROKE} strokeLinecap="round" strokeLinejoin="round" />
        <Path ref={marks as never} d={MARKS_TRACK(now)} fill={c.positive} stroke="none" />
      </AnimatedG>
      <AnimatedG opacity={ringOpacity}>
        <Path ref={front as never} d={FRONT_TRACK(now)} stroke="#fbbf24" strokeWidth={RING_WIDTH(now)} />
      </AnimatedG>
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

// One clock per kind, shared by every instance of the kind: a period page that is built next to the shown one (the pager
// builds the neighbours) joins the running picture at its phase and does not start a run of its own, and a page that slides
// into view shows the same frame as the one that was there. The value stands at the FIRST frame whenever the next visit will
// play, so the first frame a tab draws is the start of the picture, never the finished one; it goes back there when the
// screen is left. A kind that will not play (quiet) stands at the last frame.
// Operations and Statistics keep their time in a shared value that the UI thread reads (see their pictures); the other kinds
// keep it in an Animated.Value on the JavaScript thread (Scheduled on the native driver).
const DRIVEN: ReadonlySet<EmptyKind> = new Set<EmptyKind>(["operations", "statistics"]);
interface Clock {
  time: Animated.Value;
  shared?: SharedValue<number>;
  users: number;
  run?: Animated.CompositeAnimation;
  first?: number;
  wait?: ReturnType<typeof setTimeout>;
  reset?: ReturnType<typeof setTimeout>;
}
const clocks = new Map<EmptyKind, Clock>();
const restFrame = (kind: EmptyKind): number => (shouldPlay(kind) ? 0 : PLAY_MS[kind]);
const put = (clock: Clock, value: number): void => {
  if (clock.shared) clock.shared.set(value);
  else clock.time.setValue(value);
};
function clockOf(kind: EmptyKind): Clock {
  let clock = clocks.get(kind);
  if (!clock) {
    const made: Clock = { time: new Animated.Value(restFrame(kind)), shared: DRIVEN.has(kind) ? makeMutable(restFrame(kind)) : undefined, users: 0 };
    clock = made;
    clocks.set(kind, made);
    onPictureStop((finish) => haltClock(kind, made, finish));
    onActed(() => {
      if (!made.users && !made.reset) put(made, restFrame(kind));
    });
  }
  return clock;
}
// Stops a run that is going (or about to start): `finish` puts the picture at rest, otherwise it stays where it is.
function haltClock(kind: EmptyKind, clock: Clock, finish: boolean): void {
  if (clock.first !== undefined) cancelAnimationFrame(clock.first);
  if (clock.wait) clearTimeout(clock.wait);
  clock.first = undefined;
  clock.wait = undefined;
  clock.run?.stop();
  clock.run = undefined;
  if (clock.shared) cancelAnimation(clock.shared);
  if (finish && clock.users) put(clock, PLAY_MS[kind]);
}

export function EmptyState({ kind, title, hint, action, onAction }: { kind: EmptyKind; title: string; hint: string; action?: string; onAction?: () => void }): ReactNode {
  const p = usePalette();
  const t = useT();
  const clock = clockOf(kind);
  const time = clock.time;
  const total = PLAY_MS[kind];
  // Played only while the screen is in focus. `freezeOnBlur` freezes React rendering, not an `Animated` loop, so an
  // animation started on mount went on behind a tab that was left (and, JS-driven, kept the JavaScript thread busy while
  // the next tab was being built).
  useFocusEffect(
    useCallback(() => {
      clock.users += 1;
      // Back before the deferred reset ran: do it now, so the picture starts from its first frame.
      if (clock.reset) {
        clearTimeout(clock.reset);
        clock.reset = undefined;
        put(clock, restFrame(kind));
      }
      if (clock.users === 1) {
        if (!shouldPlay(kind)) put(clock, total);
        else {
          clock.first = requestAnimationFrame(() => {
            clock.first = undefined;
            clock.wait = setTimeout(() => {
              clock.wait = undefined;
              markPlayed(kind);
              // The value stands at the first frame already; the run starts from it.
              if (clock.shared) clock.shared.set(withTiming(total, { duration: total, easing: ReEasing.linear }));
              else {
                clock.run = Animated.timing(time, { toValue: total, duration: total, easing: Easing.linear, useNativeDriver: kind === "scheduled" });
                clock.run.start();
              }
            }, START_WAIT_MS);
          });
        }
      }
      return () => {
        clock.users -= 1;
        if (clock.users === 0) {
          haltClock(kind, clock, false);
          // Left: back to the first frame for the next visit (or the last one when it will not play). Not in the same
          // breath as the tab change: setting the value rewrites every shape of the picture, and that was part of what
          // the next tab waited for (0.3.14: 170-210 ms to show a tab, against 55-105 ms before).
          clock.reset = setTimeout(() => {
            clock.reset = undefined;
            if (!clock.users) put(clock, restFrame(kind));
          }, RESET_WAIT_MS);
        }
      };
    }, [clock, time, total, kind]),
  );
  const c: Colors = { ink: p.ink, muted: p.muted, bg: p.bg, accent: p.accent, positive: p.positive };
  return (
    <View style={{ alignItems: "center", paddingTop: 56, paddingHorizontal: 32, paddingBottom: 24 }}>
      <View style={{ alignItems: "center" }} importantForAccessibility="no-hide-descendants">
        {kind === "operations" && clock.shared ? <Operations time={clock.shared} c={c} /> : null}
        {kind === "accounts" ? <Accounts time={time} c={c} /> : null}
        {kind === "categories" ? <Categories time={time} c={c} /> : null}
        {kind === "statistics" && clock.shared ? <Statistics time={clock.shared} c={c} /> : null}
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
