// The picture of the About page: a team at one screen of the app (a finished illustration, assets/about-team.jpg)
// with a short piece of motion drawn over it that means something: the "+" is pressed (a ring), a check mark
// confirms it (a ring), and a spark runs along the chart up to the point the colleague is pointing at (a ring
// there). That plays once, in about five seconds, and stops. After that only a few small specks go on twinkling
// and drifting, very slowly, so the picture stays alive without drawing the eye from the text.
// Overlay coordinates are in pixels of the picture (1536 × 1024).
import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Image, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

const W = 1536;
const H = 1024;
const SCENE_MS = 5200;
const AMBIENT_MS = 16000;

// Where the line of the chart passes (read from the picture), the spark runs through these points.
const CHART: readonly (readonly [number, number])[] = [
  [891, 663],
  [929, 640],
  [988, 600],
  [1043, 621],
  [1113, 566],
];
const PLUS = [920, 420] as const;
const CHECK = [1051, 408] as const;

// A smooth line through the points (Catmull-Rom), sampled, with its length.
function route(points: typeof CHART) {
  const out: [number, number][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    for (let k = 0; k < 12; k++) {
      const t = k / 12;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push([...points[points.length - 1]!] as [number, number]);
  let length = 0;
  for (let i = 1; i < out.length; i++) length += Math.hypot(out[i]![0] - out[i - 1]![0], out[i]![1] - out[i - 1]![1]);
  return { out, length };
}

// Specks: position, size, phase of the twinkle. Placed on the plain background, away from the people.
const SPECKS: readonly (readonly [number, number, number, number])[] = [
  [150, 150, 5, 0],
  [300, 80, 4, 0.3],
  [560, 120, 5, 0.6],
  [1380, 160, 5, 0.15],
  [1450, 330, 4, 0.5],
  [90, 420, 4, 0.75],
  [1330, 80, 4, 0.9],
];

export function AboutArt() {
  const { out, length } = useMemo(() => route(CHART), []);
  const scene = useRef(new Animated.Value(0)).current; // 0 → 1 once
  const ambient = useRef(new Animated.Value(0)).current; // 0 → 1, over and over
  useEffect(() => {
    const play = Animated.timing(scene, { toValue: 1, duration: SCENE_MS, easing: Easing.linear, useNativeDriver: false });
    const drift = Animated.loop(Animated.timing(ambient, { toValue: 1, duration: AMBIENT_MS, easing: Easing.linear, useNativeDriver: false }));
    play.start();
    drift.start();
    return () => {
      play.stop();
      drift.stop();
    };
  }, [scene, ambient]);

  const at = (from: number, to: number, a: number, b: number) => scene.interpolate({ inputRange: [0, from, to, 1], outputRange: [a, a, b, b], extrapolate: "clamp" });
  const ring = (from: number, to: number) => ({ r: at(from, to, 26, 92), opacity: scene.interpolate({ inputRange: [0, from, from + (to - from) * 0.15, to, 1], outputRange: [0, 0, 0.85, 0, 0], extrapolate: "clamp" }) });
  const plus = ring(0.16, 0.3);
  const check = ring(0.26, 0.42);
  const end = ring(0.8, 0.96);
  // The spark: a short bright dash that runs along the line, and the dot at its head.
  const run = at(0.34, 0.8, 90, -length);
  const sparkOpacity = scene.interpolate({ inputRange: [0, 0.34, 0.38, 0.78, 0.82, 1], outputRange: [0, 0, 1, 1, 0, 0], extrapolate: "clamp" });
  const head = at(0.34, 0.8, 0, out.length - 1);
  const index = Array.from({ length: out.length }, (_, i) => i);
  const headX = head.interpolate({ inputRange: index, outputRange: out.map((p) => p[0]), extrapolate: "clamp" });
  const headY = head.interpolate({ inputRange: index, outputRange: out.map((p) => p[1]), extrapolate: "clamp" });
  const line = "M" + out.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L");
  const enter = scene.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 1, 1], extrapolate: "clamp" });
  const settle = scene.interpolate({ inputRange: [0, 0.14, 1], outputRange: [1.045, 1, 1], extrapolate: "clamp" });

  return (
    <View style={{ width: "100%", maxWidth: 520, alignSelf: "center", aspectRatio: W / H, borderRadius: 20, overflow: "hidden", backgroundColor: "#d9d4f7" }}>
      <Animated.View style={{ flex: 1, opacity: enter, transform: [{ scale: settle }] }}>
        <Image source={require("../../assets/about-team.jpg")} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0 }} pointerEvents="none">
          <AnimatedCircle cx={PLUS[0]} cy={PLUS[1]} r={plus.r} stroke="#ffffff" strokeWidth={7} fill="none" opacity={plus.opacity} />
          <AnimatedCircle cx={CHECK[0]} cy={CHECK[1]} r={check.r} stroke="#ffffff" strokeWidth={7} fill="none" opacity={check.opacity} />
          <AnimatedPath d={line} stroke="#b9a4ff" strokeWidth={26} strokeLinecap="round" fill="none" strokeDasharray={`90 ${length + 400}`} strokeDashoffset={run} opacity={Animated.multiply(sparkOpacity, 0.55)} />
          <AnimatedPath d={line} stroke="#ffffff" strokeWidth={9} strokeLinecap="round" fill="none" strokeDasharray={`90 ${length + 400}`} strokeDashoffset={run} opacity={sparkOpacity} />
          <AnimatedCircle cx={headX} cy={headY} r={12} fill="#ffffff" opacity={sparkOpacity} />
          <AnimatedCircle cx={CHART[CHART.length - 1]![0]} cy={CHART[CHART.length - 1]![1]} r={end.r} stroke="#ffffff" strokeWidth={7} fill="none" opacity={end.opacity} />
          {SPECKS.map(([x, y, r, phase], i) => (
            <AnimatedCircle
              key={i}
              cx={x}
              cy={ambient.interpolate({ inputRange: [0, 0.5, 1], outputRange: [y, y - 14 - (i % 3) * 4, y] })}
              r={r}
              fill="#ffffff"
              opacity={ambient.interpolate({ inputRange: [0, phase, Math.min(1, phase + 0.25), 1].sort((a, b) => a - b), outputRange: [0.25, 0.25, 0.95, 0.25].slice(0, 4) })}
            />
          ))}
        </Svg>
      </Animated.View>
    </View>
  );
}
