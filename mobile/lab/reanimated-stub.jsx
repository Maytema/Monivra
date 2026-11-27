// react-native-reanimated on the page: shared values are boxes, animated styles are empty, the scroll view keeps its props for the test.
import React from "react";
import { ScrollView as Scroll, View } from "./rn-stub.jsx";
export const deckHandle = (globalThis.__labDeck ??= { props: null });
const DeckScroll = React.forwardRef(function DeckScroll(props, ref) {
  deckHandle.props = props;
  React.useImperativeHandle(ref, () => ({ scrollTo() {} }), []);
  return <Scroll>{props.children}</Scroll>;
});
export const useSharedValue = (v) => React.useRef({ value: v }).current;
export const useDerivedValue = (f) => ({ get value() { return f(); } });
export const useAnimatedStyle = () => ({});
export const useAnimatedScrollHandler = () => () => {};
export const interpolate = () => 0;
export const Extrapolation = { CLAMP: "clamp" };
export const makeMutable = (v) => ({ value: v });
export const cancelAnimation = () => {};
export const withTiming = (v) => v;
export const useAnimatedProps = () => ({});
export const Easing = new Proxy({}, { get: () => () => (t) => t });
const Reanimated = { View, ScrollView: DeckScroll, createAnimatedComponent: (C) => C };
export default Reanimated;
