// The picture of the About page: a team at one screen of the app. A man sits at the monitor and clicks "+",
// a woman beside him notes it on a tablet, a colleague leans in and points at the chart; the chart draws
// itself and a check mark pops up. That main movement lasts a few seconds and stops. Afterwards only slow
// ambient things go on: the steam over the mug, a few specks and icons drifting. The colours of the scene are
// its own (it is an illustration, it does not change with the theme).
import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SKIN = "#f1b99f";
const SKIN_SHADE = "#dea287";
const INK = "#2b2f6b";
const PURPLE = "#7a5af0";
const LILAC = "#e9e6fd";
const SHIRT_WHITE = "#f7f5ff";
const LEAF = "#5aa57f";
const LEAF_DARK = "#3f8a68";

// The main movement: one run of this many ms, then it rests.
const SCENE_MS = 4600;
// The ambient loop: very slow.
const AMBIENT_MS = 14000;

// Plant in a pot, drawn from a few leaves.
function Plant({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${scale})`}>
      <Path d="M0 0 C-20 -22 -22 -46 -8 -62 C2 -44 6 -20 0 0z" fill={LEAF} />
      <Path d="M2 0 C14 -20 30 -34 44 -34 C38 -14 22 -2 2 0z" fill={LEAF_DARK} />
      <Path d="M-2 0 C-18 -8 -36 -10 -44 -2 C-30 8 -14 6 -2 0z" fill={LEAF} />
      <Path d="M-14 0h28l-4 26h-20z" fill="#d9d4f7" />
    </G>
  );
}

export function AboutArt() {
  const scene = useRef(new Animated.Value(0)).current; // 0 → 1 once
  const ambient = useRef(new Animated.Value(0)).current; // 0 → 1, over and over, slowly
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

  // Values over a stretch of the scene: 0 before `from`, 1 after `to`.
  const at = (from: number, to: number, out: number[] = [0, 1]) => scene.interpolate({ inputRange: [0, from, to, 1], outputRange: [out[0] ?? 0, out[0] ?? 0, out[1] ?? 1, out[1] ?? 1], extrapolate: "clamp" });
  // A wave while the scene plays that dies down to nothing at its end.
  const wave = (cycles: number, amount: number) =>
    scene.interpolate({
      inputRange: Array.from({ length: 21 }, (_, i) => i / 20),
      outputRange: Array.from({ length: 21 }, (_, i) => Math.sin((i / 20) * cycles * Math.PI * 2) * amount * Math.max(0, 1 - Math.pow(i / 20, 2.2))),
    });
  const slow = (cycles: number, amount: number, phase = 0) =>
    ambient.interpolate({
      inputRange: Array.from({ length: 13 }, (_, i) => i / 12),
      outputRange: Array.from({ length: 13 }, (_, i) => Math.sin((i / 12 + phase) * cycles * Math.PI * 2) * amount),
    });

  const chart = at(0.25, 0.8, [150, 0]);
  const check = at(0.55, 0.7);
  const plusPress = scene.interpolate({ inputRange: [0, 0.42, 0.47, 0.55, 1], outputRange: [1, 1, 0.78, 1.18, 1], extrapolate: "clamp" });
  const arm = at(0.12, 0.38).interpolate({ inputRange: [0, 1], outputRange: ["M298 110 Q301 140 303 170", "M298 110 Q276 108 258 118"] });
  const handX = at(0.12, 0.38, [303, 257]);
  const handY = at(0.12, 0.38, [172, 119]);
  const poke = wave(3, 2.2);
  const mouseHand = scene.interpolate({ inputRange: [0, 0.4, 0.46, 0.55, 1], outputRange: [0, 0, 1.6, 0, 0], extrapolate: "clamp" });
  const pen = wave(5, 2);
  const steamA = slow(1, 3);
  const steamLift = ambient.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  const steamFade = ambient.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.15, 0.6, 0.15] });
  const iconBob = slow(1, 3, 0);
  const iconBob2 = slow(1, 3, 0.4);
  const iconBob3 = slow(1, 3, 0.7);
  const twinkle = ambient.interpolate({ inputRange: [0, 0.33, 0.66, 1], outputRange: [0.2, 0.9, 0.3, 0.2] });
  const twinkle2 = ambient.interpolate({ inputRange: [0, 0.33, 0.66, 1], outputRange: [0.8, 0.2, 0.9, 0.8] });

  return (
    <Svg width="100%" viewBox="0 0 360 240" style={{ maxWidth: 440, alignSelf: "center", aspectRatio: 360 / 240 }}>
      <Defs>
        <LinearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#e8e5ff" />
          <Stop offset="1" stopColor="#cbc6f6" />
        </LinearGradient>
        <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={PURPLE} stopOpacity={0.35} />
          <Stop offset="1" stopColor={PURPLE} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={360} height={240} rx={18} fill="url(#sky)" />
      <Circle cx={175} cy={96} r={96} fill="#ffffff" opacity={0.28} />
      <Circle cx={40} cy={190} r={60} fill="#ffffff" opacity={0.18} />

      {/* Ambient things: icons drift very slowly, specks twinkle. */}
      <AnimatedG translateY={iconBob}>
        <Rect x={120} y={12} width={30} height={26} rx={7} fill="#ffffff" opacity={0.85} />
        <Path d="M128 31v-7m5 7v-12m5 12v-9" stroke={PURPLE} strokeWidth={3} strokeLinecap="round" />
      </AnimatedG>
      <AnimatedG translateY={iconBob2}>
        <Circle cx={196} cy={22} r={9} stroke={PURPLE} strokeWidth={4} strokeDasharray="4 3" fill="none" opacity={0.75} />
        <Circle cx={196} cy={22} r={4} fill="#ffffff" />
      </AnimatedG>
      <AnimatedG translateY={iconBob3}>
        <Rect x={238} y={20} width={28} height={24} rx={7} fill="#ffffff" opacity={0.85} />
        <Path d="m246 32 4 4 8-8" stroke={PURPLE} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </AnimatedG>
      <AnimatedCircle cx={104} cy={30} r={2.4} fill="#ffffff" opacity={twinkle} />
      <AnimatedCircle cx={218} cy={10} r={2} fill="#ffffff" opacity={twinkle2} />
      <AnimatedCircle cx={276} cy={52} r={2.6} fill="#ffffff" opacity={twinkle} />
      <AnimatedCircle cx={92} cy={70} r={1.8} fill="#ffffff" opacity={twinkle2} />

      <Plant x={14} y={196} scale={1.1} />

      {/* The monitor with the interface of the app. */}
      <Rect x={226} y={166} width={16} height={30} fill="#9b96d8" />
      <Ellipse cx={234} cy={198} rx={34} ry={5} fill="#8a84cf" />
      <Rect x={128} y={42} width={206} height={126} rx={7} fill={INK} />
      <Rect x={133} y={47} width={196} height={116} rx={4} fill="#f1efff" />
      <Rect x={133} y={47} width={30} height={116} rx={4} fill="#4d4aa6" />
      <Rect x={139} y={53} width={11} height={11} rx={3} fill={PURPLE} />
      <SvgText x={141.2} y={61.4} fill="#ffffff" fontSize={8} fontWeight="700">
        M
      </SvgText>
      <Rect x={140} y={74} width={17} height={14} rx={4} fill={PURPLE} />
      {[96, 110, 124, 138].map((y) => (
        <Circle key={y} cx={148.5} cy={y + 5} r={4} fill="#a29fe0" />
      ))}
      <Rect x={170} y={53} width={150} height={7} rx={3.5} fill="#dcd8fb" />
      <Rect x={170} y={67} width={72} height={26} rx={6} fill="#ffffff" />
      <Rect x={176} y={75} width={11} height={10} rx={3} fill="#9d87f5" />
      {[193, 199, 205].map((x) => (
        <Circle key={x} cx={x} cy={80} r={1.5} fill={INK} />
      ))}
      <AnimatedG origin="226, 80" scale={plusPress}>
        <Rect x={220} y={74} width={12} height={12} rx={3.5} fill={PURPLE} />
        <Path d="M226 77v6m-3-3h6" stroke="#ffffff" strokeWidth={1.6} strokeLinecap="round" />
      </AnimatedG>
      <Rect x={248} y={67} width={72} height={26} rx={6} fill="#e3f6ec" />
      <AnimatedG origin="262, 80" scale={check}>
        <Circle cx={262} cy={80} r={8} fill="#2fae6e" />
        <Path d="m258 80 3 3 5-6" stroke="#ffffff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </AnimatedG>
      <Rect x={274} y={74} width={36} height={4} rx={2} fill="#9bd9b9" />
      <Rect x={274} y={82} width={26} height={4} rx={2} fill="#b9e6cd" />
      <Rect x={170} y={99} width={40} height={58} rx={6} fill="#ffffff" />
      {[[111, "#2fae6e"], [128, "#ee5f93"], [145, "#8a63f2"]].map(([y, c]) => (
        <G key={String(y)}>
          <Circle cx={181} cy={Number(y)} r={5} fill={String(c)} />
          <Rect x={190} y={Number(y) - 3} width={14} height={3} rx={1.5} fill="#cfcbf0" />
          <Rect x={190} y={Number(y) + 1.5} width={9} height={2.5} rx={1.2} fill="#e3e0f8" />
        </G>
      ))}
      <Rect x={216} y={99} width={104} height={58} rx={6} fill="#ffffff" />
      <Rect x={224} y={105} width={30} height={4} rx={2} fill="#d6d2f6" />
      <Path d="M222 150 C232 148 236 136 246 138 C258 140 260 128 272 132 C284 136 288 118 300 118 C306 118 312 112 316 108 L316 152 L222 152z" fill="url(#area)" />
      <AnimatedPath d="M222 150 C232 148 236 136 246 138 C258 140 260 128 272 132 C284 136 288 118 300 118 C306 118 312 112 316 108" stroke={PURPLE} strokeWidth={2.2} strokeLinecap="round" fill="none" strokeDasharray="150 150" strokeDashoffset={chart} />

      {/* Desk. */}
      <Rect x={0} y={198} width={360} height={42} fill="#d9d4f7" />
      <Rect x={0} y={198} width={360} height={4} fill="#c6c0f0" />
      <Rect x={186} y={206} width={44} height={10} rx={5} fill="#6f69c4" opacity={0.55} />
      <Ellipse cx={226} cy={209} rx={8} ry={5.5} fill={INK} />

      {/* Mug with steam: the steam never stops. */}
      <Path d="M266 190h24v14a6 6 0 0 1-6 6h-12a6 6 0 0 1-6-6z" fill="#ffffff" />
      <Path d="M290 193h3a4 4 0 0 1 0 8h-3" stroke="#ffffff" strokeWidth={2.4} fill="none" />
      <Rect x={274} y={196} width={8} height={10} rx={2} fill={PURPLE} />
      <AnimatedG translateY={steamLift} opacity={steamFade}>
        <AnimatedG translateX={steamA}>
          <Path d="M272 184c-5-6 4-9-1-15" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round" fill="none" />
          <Path d="M282 184c-5-6 4-9-1-15" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round" fill="none" />
        </AnimatedG>
      </AnimatedG>
      <Rect x={298} y={190} width={52} height={10} rx={2} fill="#4d4aa6" />
      <Rect x={302} y={181} width={44} height={9} rx={2} fill="#8a63f2" />

      {/* Standing colleague at the right: leans in and points at the chart. */}
      <G>
        <Path d="M296 240 L300 104 Q322 92 354 104 L360 240z" fill={SHIRT_WHITE} />
        <Path d="M352 100 L360 100 L360 240 L352 240z" fill="#e8e4fa" />
        <Rect x={312} y={84} width={12} height={14} rx={5} fill={SKIN_SHADE} />
        <Circle cx={318} cy={70} r={18} fill={SKIN} />
        <Path d="M300 66 C298 46 312 40 324 44 C336 46 338 58 334 66 C330 58 318 54 308 58 C304 60 302 63 300 66z" fill="#3b2a2f" />
        <Path d="M303 74 C304 90 316 94 324 90 C332 86 334 78 334 74 C328 80 310 80 303 74z" fill="#3b2a2f" />
        <Circle cx={309} cy={70} r={1.7} fill={INK} />
        <Path d="M306 77 Q310 80 314 77" stroke="#b86d5b" strokeWidth={1.4} strokeLinecap="round" fill="none" />
        <AnimatedPath d={arm} stroke={SHIRT_WHITE} strokeWidth={13} strokeLinecap="round" fill="none" />
        <AnimatedG translateX={poke}>
          <AnimatedCircle cx={handX} cy={handY} r={6} fill={SKIN} />
        </AnimatedG>
      </G>

      {/* Standing woman at the left: notes on a tablet. */}
      <G>
        <Path d="M24 240 L28 112 Q50 98 76 112 L84 240z" fill="#f3f0ff" />
        <Path d="M30 196 L84 196 L88 240 L24 240z" fill="#3d3f8a" />
        <Rect x={44} y={86} width={12} height={14} rx={5} fill={SKIN_SHADE} />
        <Circle cx={50} cy={72} r={17} fill={SKIN} />
        <Circle cx={44} cy={46} r={10} fill="#3a2530" />
        <Path d="M33 70 C30 50 44 44 58 48 C68 52 68 64 66 74 C62 62 48 58 40 62 C36 64 34 67 33 70z" fill="#3a2530" />
        <Circle cx={59} cy={72} r={1.7} fill={INK} />
        <Path d="M56 80 Q60 83 64 80" stroke="#b86d5b" strokeWidth={1.4} strokeLinecap="round" fill="none" />
        <Path d="M40 62c-6 0-8 10-6 18" stroke="#3a2530" strokeWidth={4} strokeLinecap="round" fill="none" />
        <Path d="M66 138 L104 126 L112 154 L74 166z" fill={INK} />
        <Path d="M71 140 L102 130 L108 151 L77 161z" fill="#6c6bc6" />
        <Path d="M78 148 L98 141" stroke="#ffffff" strokeWidth={1.6} strokeLinecap="round" opacity={0.8} />
        <Path d="M76 112 Q82 130 70 150" stroke="#f3f0ff" strokeWidth={13} strokeLinecap="round" fill="none" />
        <AnimatedG translateX={pen} translateY={Animated.multiply(pen, -0.5)}>
          <Circle cx={96} cy={138} r={4.6} fill={SKIN} />
          <Path d="M96 138 l8 -10" stroke="#4d4aa6" strokeWidth={2} strokeLinecap="round" />
        </AnimatedG>
        <Path d="M30 120 Q22 150 36 170" stroke="#f3f0ff" strokeWidth={13} strokeLinecap="round" fill="none" />
        <Circle cx={37} cy={170} r={5} fill={SKIN} />
      </G>

      {/* Seated man in front of the monitor, seen from behind and the side. */}
      <G>
        <Rect x={86} y={178} width={100} height={62} rx={16} fill="#5a55b8" />
        <Path d="M96 240 L100 196 Q134 178 172 196 L178 240z" fill="#5f49d1" />
        <Rect x={126} y={152} width={14} height={16} rx={6} fill={SKIN_SHADE} />
        <Circle cx={134} cy={140} r={20} fill={SKIN} />
        <Path d="M114 142 C108 118 128 110 144 114 C156 118 156 130 152 138 C146 128 132 126 124 130 C118 132 116 138 114 142z" fill="#3f2b30" />
        <Path d="M121 150 C124 164 140 166 148 160 C152 156 152 150 152 146 C144 152 128 152 121 150z" fill="#3f2b30" opacity={0.85} />
        <Rect x={141} y={132} width={13} height={9} rx={4} stroke={INK} strokeWidth={1.4} fill="none" />
        <Path d="M154 136h5" stroke={INK} strokeWidth={1.4} />
        <Path d="M170 198 Q198 204 206 208" stroke="#5f49d1" strokeWidth={14} strokeLinecap="round" fill="none" />
        <AnimatedG translateX={mouseHand} translateY={Animated.multiply(mouseHand, 0.5)}>
          <Circle cx={212} cy={208} r={6} fill={SKIN} />
        </AnimatedG>
      </G>
    </Svg>
  );
}
