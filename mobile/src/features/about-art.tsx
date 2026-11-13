// The picture of the About page: three people at one app window — one hands over a blue card, one points,
// one shows a thumb up — with a gear, a coin and a check badge. For the first seconds everything moves; the
// movement then dies down on its own (it must not keep drawing the eye while the text is read) and only a few
// small specks go on floating, very slowly.
import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";
import { usePalette } from "../ui/app-context.tsx";
import { mix } from "../ui/theme.ts";

const AnimatedG = Animated.createAnimatedComponent(G);
const SKIN = "#f2b79f";
const SKIN_DARK = "#e0a088";
const INDIGO = "#4a56d4";
const HAIR = "#26233a";
const GOLD = "#f6c744";
// How long the main movement lasts at full strength, and how long it takes to fade.
const ACTIVE_MS = 3200;
const FADE_MS = 3200;
const BEAT_MS = 2200;

function Gear({ cx, cy, r, color }: { cx: number; cy: number; r: number; color: string }) {
  return (
    <G>
      <Circle cx={cx} cy={cy} r={r} stroke={color} strokeWidth={r * 0.42} strokeDasharray={`${r * 0.36} ${r * 0.36}`} fill="none" />
      <Circle cx={cx} cy={cy} r={r * 0.78} fill={color} />
      <Circle cx={cx} cy={cy} r={r * 0.34} fill="#ffffff" opacity={0.9} />
    </G>
  );
}

export function AboutArt() {
  const p = usePalette();
  const beat = useRef(new Animated.Value(0)).current; // 0 → 1, over and over while the movement lasts
  const energy = useRef(new Animated.Value(1)).current; // 1 at the start, 0 when it has died down
  const pop = useRef(new Animated.Value(0)).current; // the check badge comes in once
  const drift = useRef(new Animated.Value(0)).current; // the specks, always, quietly
  useEffect(() => {
    const beats = Animated.loop(Animated.timing(beat, { toValue: 1, duration: BEAT_MS, easing: Easing.linear, useNativeDriver: false }));
    beats.start();
    const calm = Animated.timing(energy, { toValue: 0, delay: ACTIVE_MS, duration: FADE_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: false });
    calm.start(({ finished }) => {
      if (finished) beats.stop();
    });
    const badge = Animated.spring(pop, { toValue: 1, delay: 700, friction: 5, tension: 120, useNativeDriver: false });
    badge.start();
    const specks = Animated.loop(Animated.timing(drift, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: false }));
    specks.start();
    return () => {
      beats.stop();
      calm.stop();
      badge.stop();
      specks.stop();
    };
  }, [beat, energy, pop, drift]);

  // A swing between -1 and 1 that follows the beat, weakened by the energy that is left; `phase` shifts it.
  const swing = (amount: number, phase = 0) => {
    const shifted = Animated.modulo(Animated.add(beat, phase), 1);
    const wave = shifted.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, 1, 0, -1, 0] });
    return Animated.multiply(Animated.multiply(wave, energy), amount);
  };
  // A speck: a slow circle around its place; the sin of two turns per cycle keeps it from ever stopping.
  const speck = (amount: number, phase: number) => {
    const shifted = Animated.modulo(Animated.add(drift, phase), 1);
    return Animated.multiply(shifted.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, 1, 0, -1, 0] }), amount);
  };

  const skin = SKIN;
  const outline = mix(p.accent, p.bg, 0.55);
  const pale = mix(p.accent, p.bg, 0.12);
  const gearColor = mix(p.accent, p.bg, 0.22);
  return (
    <Svg width="100%" viewBox="0 0 320 250" style={{ maxWidth: 420, alignSelf: "center", aspectRatio: 320 / 250 }}>
      <Defs>
        <LinearGradient id="aboutArtFade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={p.bg} stopOpacity={0} />
          <Stop offset="1" stopColor={p.bg} stopOpacity={1} />
        </LinearGradient>
      </Defs>

      {/* Gears behind everything. */}
      <AnimatedG rotation={swing(14)} originX={252} originY={96}>
        <Gear cx={252} cy={96} r={20} color={gearColor} />
      </AnimatedG>
      <AnimatedG rotation={swing(-18)} originX={66} originY={116}>
        <Gear cx={66} cy={116} r={13} color={gearColor} />
      </AnimatedG>
      <Path d="M52 150 C 40 128, 44 104, 70 92 M268 108 C 292 120, 292 150, 276 170" stroke={outline} strokeWidth={1.4} strokeDasharray="3 5" fill="none" />

      {/* The person at the top: hands the blue card over, the other hand up. */}
      <G>
        <Rect x={126} y={84} width={52} height={50} rx={18} fill={p.accent} />
        <AnimatedG translateY={swing(2, 0.1)}>
          <Rect x={138} y={46} width={26} height={30} rx={13} fill={skin} />
          <Path d="M135 56 C 134 36, 168 34, 167 54 C 160 50, 150 46, 135 56Z" fill={GOLD} />
        </AnimatedG>
        <AnimatedG rotation={swing(16, 0.3)} originX={176} originY={96}>
          <Path d="M176 96 L 204 68" stroke={skin} strokeWidth={10} strokeLinecap="round" />
          <Circle cx={206} cy={65} r={6} fill={skin} />
        </AnimatedG>
      </G>

      {/* The window. */}
      <Rect x={76} y={118} width={168} height={112} rx={12} fill={p.sheet} stroke={outline} strokeWidth={1.6} />
      <Rect x={76} y={118} width={168} height={20} rx={12} fill={pale} />
      <Circle cx={90} cy={128} r={2.6} fill={p.muted} opacity={0.6} />
      <Circle cx={99} cy={128} r={2.6} fill={p.muted} opacity={0.6} />
      <Circle cx={108} cy={128} r={2.6} fill={p.muted} opacity={0.6} />
      <Rect x={92} y={150} width={46} height={7} rx={3.5} fill={p.accent} />
      <Rect x={92} y={164} width={30} height={5} rx={2.5} fill={p.muted} opacity={0.45} />
      <Rect x={92} y={176} width={60} height={5} rx={2.5} fill={p.muted} opacity={0.3} />
      <G rotation={-90} originX={204} originY={170}>
        <Circle cx={204} cy={170} r={19} stroke={pale} strokeWidth={9} fill="none" />
        <Circle cx={204} cy={170} r={19} stroke={p.accent} strokeWidth={9} fill="none" strokeDasharray={`${0.46 * 119.4} 119.4`} />
        <Circle cx={204} cy={170} r={19} stroke={p.positive} strokeWidth={9} fill="none" strokeDasharray={`${0.26 * 119.4} 119.4`} strokeDashoffset={-0.5 * 119.4} />
      </G>
      <AnimatedG scale={pop} originX={204} originY={170}>
        <Circle cx={204} cy={170} r={11} fill={GOLD} />
        <Path d="M198 170 l4 4 8-9" stroke="#ffffff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </AnimatedG>
      <Rect x={92} y={198} width={136} height={20} rx={8} fill={p.bg} stroke={p.line} strokeWidth={1} />
      <Rect x={100} y={205} width={46} height={5} rx={2.5} fill={p.muted} opacity={0.45} />
      <Rect x={190} y={204} width={30} height={6} rx={3} fill={p.positive} />
      <AnimatedG translateY={swing(2.5, 0.5)}>
        <Rect x={112} y={190} width={36} height={22} rx={6} fill="#ffffff" stroke={outline} strokeWidth={1.2} />
        <SvgText x={130} y={205} fontSize={11} fontWeight="700" fill={GOLD} textAnchor="middle">{"</>"}</SvgText>
      </AnimatedG>
      <AnimatedG translateY={swing(4, 0.2)}>
        <Circle cx={236} cy={124} r={9} fill={GOLD} />
        <Circle cx={236} cy={124} r={5.5} stroke="#ffffff" strokeWidth={1.4} fill="none" opacity={0.8} />
      </AnimatedG>

      {/* The blue card the top person hands over lies on the window. */}
      <AnimatedG rotation={swing(-12, 0.1)} originX={130} originY={98}>
        <Path d="M130 98 L 112 124" stroke={skin} strokeWidth={10} strokeLinecap="round" />
        <Rect x={92} y={116} width={30} height={20} rx={5} fill="#3b82f6" />
      </AnimatedG>

      {/* The person on the left with a tablet, glasses, pointing at the window. */}
      <G>
        <Rect x={22} y={186} width={56} height={60} rx={20} fill={INDIGO} />
        <AnimatedG translateY={swing(2, 0.6)}>
          <Rect x={36} y={146} width={28} height={34} rx={14} fill={SKIN_DARK} />
          <Path d="M33 160 C 30 138, 66 134, 67 158 C 60 150, 46 146, 33 160Z" fill={HAIR} />
          <Circle cx={43} cy={163} r={4.4} stroke={HAIR} strokeWidth={1.4} fill="none" />
          <Circle cx={56} cy={163} r={4.4} stroke={HAIR} strokeWidth={1.4} fill="none" />
        </AnimatedG>
        <AnimatedG rotation={swing(10, 0.8)} originX={72} originY={204}>
          <Path d="M72 204 L 96 196" stroke={SKIN_DARK} strokeWidth={9} strokeLinecap="round" />
        </AnimatedG>
        <Rect x={22} y={216} width={24} height={32} rx={4} fill="#22203a" transform="rotate(-14 34 232)" />
      </G>

      {/* The person on the right with a thumb up. */}
      <G>
        <Rect x={246} y={186} width={56} height={60} rx={20} fill={INDIGO} />
        <AnimatedG translateY={swing(2, 0.9)}>
          <Rect x={260} y={146} width={28} height={34} rx={14} fill={skin} />
          <Path d="M257 158 C 258 138, 292 138, 290 160 C 284 152, 268 148, 257 158Z" fill={HAIR} />
        </AnimatedG>
        <AnimatedG scale={Animated.add(1, Animated.multiply(Animated.multiply(Animated.modulo(Animated.add(beat, 0.4), 1).interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] }), energy), 0.12))} originX={236} originY={196}>
          <Path d="M250 204 L 236 192" stroke={skin} strokeWidth={9} strokeLinecap="round" />
          <Rect x={230} y={176} width={9} height={18} rx={4.5} fill={skin} />
        </AnimatedG>
      </G>

      {/* Down below the picture fades into the page. */}
      <Rect x={0} y={196} width={320} height={54} fill="url(#aboutArtFade)" />

      {/* Specks that stay. */}
      <AnimatedG translateY={speck(3, 0)}>
        <Circle cx={30} cy={64} r={4.5} fill={p.tint} />
      </AnimatedG>
      <AnimatedG translateY={speck(-3, 0.3)}>
        <Circle cx={292} cy={72} r={3.5} fill={mix(p.accent, p.bg, 0.4)} />
      </AnimatedG>
      <AnimatedG translateY={speck(2.5, 0.6)}>
        <Circle cx={300} cy={150} r={3} fill={mix(p.positive, p.bg, 0.5)} />
      </AnimatedG>
      <AnimatedG translateY={speck(-2, 0.8)}>
        <Circle cx={18} cy={118} r={2.6} fill={mix(GOLD, p.bg, 0.5)} />
      </AnimatedG>
      <AnimatedG translateY={speck(2, 0.45)}>
        <Circle cx={160} cy={30} r={2.4} fill={mix(p.accent, p.bg, 0.5)} />
      </AnimatedG>
    </Svg>
  );
}
