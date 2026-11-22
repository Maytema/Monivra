// An SVG group turned or scaled about the point (x, y).
import { Animated } from "react-native";
import { G } from "react-native-svg";
import type { ReactNode } from "react";

const AnimatedG = Animated.createAnimatedComponent(G);
type Value = Animated.AnimatedInterpolation<number> | number;
// Written as three nested groups (move there, turn, move back), so
// that no "origin" property is needed: on an animated group the origin was not honoured and the picture turned about
// the corner of the drawing instead and slid away from its place.
export function Pivot({ x, y, rotation, scale, scaleY, children }: { x: number; y: number; rotation?: Animated.AnimatedInterpolation<number> | number; scale?: Animated.AnimatedInterpolation<number> | number; scaleY?: Animated.AnimatedInterpolation<number> | number; children: ReactNode }) {
  return (
    <G translateX={x} translateY={y}>
      <AnimatedG rotation={rotation} scale={scale} scaleY={scaleY}>
        <G translateX={-x} translateY={-y}>{children}</G>
      </AnimatedG>
    </G>
  );
}
