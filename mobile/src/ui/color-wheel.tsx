// The colour wheel of the colour picker (js/app/color-wheel.js): a ring of hues with a square of
// saturation and brightness turned 45° inside it. The finger on the ring sets the hue, inside it
// the square; the thumbs sit where the colour is.
import { useRef, useState } from "react";
import { PanResponder, View } from "react-native";
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { hexToHsv, hsvToHex } from "./color-tools.ts";

const RING_INNER = 0.76; // where the ring starts, share of the radius
const SQUARE_HALF = 0.5; // half a side of the square, share of the radius
const TURN = Math.PI / 4;
const STEP = 2; // degrees per wedge of the ring

const wedges = Array.from({ length: 360 / STEP }, (_, i) => {
  const a = (i * STEP * Math.PI) / 180;
  const b = ((i * STEP + STEP + 0.6) * Math.PI) / 180;
  const point = (angle: number, r: number) => `${(50 + Math.sin(angle) * r).toFixed(2)} ${(50 - Math.cos(angle) * r).toFixed(2)}`;
  return { color: hsvToHex(i * STEP, 1, 1), d: `M${point(a, 50)}A50 50 0 0 1 ${point(b, 50)}L${point(b, 37.5)}A37.5 37.5 0 0 0 ${point(a, 37.5)}Z` };
});

// Hue, saturation and value of a colour (a grey keeps the hue it had).
const valuesOf = (hex: string, hue: number): [number, number, number] => {
  const [h, s, v] = hexToHsv(hex);
  return [s ? h : hue, s, v];
};

export function ColorWheel({ color, size, onChange }: { color: string; size: number; onChange: (hex: string) => void }) {
  const hue = useRef(0);
  const [h, s, v] = valuesOf(color, hue.current);
  hue.current = h;
  const state = useRef({ h, s, v, mode: "hue" as "hue" | "square", size });
  state.current = { ...state.current, h, s, v, size };
  const [live, setLive] = useState<[number, number, number] | null>(null);
  const latest = useRef(onChange);
  latest.current = onChange;
  const shown = live ?? [h, s, v];
  const update = (x: number, y: number) => {
    const radius = state.current.size / 2;
    const dx = (x - radius) / radius;
    const dy = (y - radius) / radius;
    let { h: nh, s: ns, v: nv } = state.current;
    if (state.current.mode === "hue") nh = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    else {
      const lx = dx * Math.cos(TURN) + dy * Math.sin(TURN);
      const ly = -dx * Math.sin(TURN) + dy * Math.cos(TURN);
      const clamp = (n: number) => Math.min(1, Math.max(0, n));
      ns = clamp((lx / SQUARE_HALF + 1) / 2);
      nv = clamp(1 - (ly / SQUARE_HALF + 1) / 2);
    }
    state.current = { ...state.current, h: nh, s: ns, v: nv };
    hue.current = nh;
    setLive([nh, ns, nv]);
    latest.current(hsvToHex(nh, ns, nv));
  };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e: { nativeEvent: { locationX: number; locationY: number } }) => {
        const radius = state.current.size / 2;
        const { locationX: x, locationY: y } = e.nativeEvent;
        state.current.mode = Math.hypot(x - radius, y - radius) / radius >= RING_INNER ? "hue" : "square";
        update(x, y);
      },
      onPanResponderMove: (e: { nativeEvent: { locationX: number; locationY: number } }) => update(e.nativeEvent.locationX, e.nativeEvent.locationY),
      onPanResponderRelease: () => setLive(null),
      onPanResponderTerminate: () => setLive(null),
    }),
  ).current;
  const [ch, cs, cv] = shown;
  const angle = (ch * Math.PI) / 180;
  const ring = (1 + RING_INNER) / 2;
  const lx = (cs * 2 - 1) * SQUARE_HALF;
  const ly = (1 - cv * 2) * SQUARE_HALF;
  const at = (x: number, y: number) => ({ left: size / 2 + (x * size) / 2, top: size / 2 + (y * size) / 2 });
  const ringAt = at(Math.sin(angle) * ring, -Math.cos(angle) * ring);
  const squareAt = at(lx * Math.cos(TURN) - ly * Math.sin(TURN), lx * Math.sin(TURN) + ly * Math.cos(TURN));
  const thumb = (position: { left: number; top: number }, fill: string) => (
    <View pointerEvents="none" style={{ position: "absolute", left: position.left - 13, top: position.top - 13, width: 26, height: 26, borderRadius: 13, borderWidth: 3, borderColor: "#ffffff", backgroundColor: fill, elevation: 4, shadowColor: "#000000", shadowOpacity: 0.4, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }} />
  );
  return (
    <View style={{ width: size, height: size, alignSelf: "center" }} {...pan.panHandlers}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="wheel-hue" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#ffffff" />
            <Stop offset="1" stopColor={hsvToHex(ch, 1, 1)} />
          </LinearGradient>
          <LinearGradient id="wheel-dark" x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor="#000000" stopOpacity="1" />
            <Stop offset="1" stopColor="#000000" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {wedges.map((w, i) => (
          <Path key={i} d={w.d} fill={w.color} />
        ))}
        <G rotation={45} origin="50, 50">
          <Rect x={25} y={25} width={50} height={50} rx={3} fill="url(#wheel-hue)" />
          <Rect x={25} y={25} width={50} height={50} rx={3} fill="url(#wheel-dark)" />
        </G>
      </Svg>
      {thumb(ringAt, hsvToHex(ch, 1, 1))}
      {thumb(squareAt, hsvToHex(ch, cs, cv))}
    </View>
  );
}
