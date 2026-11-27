// React Native on the page: the components are plain elements, Animated is inert. Enough to draw the screens and count what is built.
import React from "react";
const flat = (s) => (Array.isArray(s) ? s.flatMap(flat) : s && typeof s === "object" ? [s] : []);
const clean = (style) => {
  const out = {};
  for (const o of flat(style)) for (const [k, v] of Object.entries(o)) if (typeof v === "string" || typeof v === "number") out[k] = v;
  return out;
};
const box = (tag) => React.forwardRef(function Box({ style, children, onLayout, testID, ...rest }, ref) {
  const props = { style: clean(style), "data-t": testID };
  if (rest.accessibilityLabel) props["aria-label"] = rest.accessibilityLabel;
  return React.createElement(tag, { ...props, ref }, typeof children === "function" ? null : children);
});
export const View = box("div");
export const Text = box("span");
export const TextInput = box("input");
export const ScrollView = box("div");
export const Image = box("img");
export const Pressable = box("div");
export const Modal = ({ children }) => children;
class Value { constructor(v) { this.v = v; } setValue(v) { this.v = v; } interpolate() { return new Value(0); } addListener() { return ""; } removeListener() {} }
export const Animated = {
  Value, View, Text, ScrollView,
  add: () => new Value(0), multiply: () => new Value(0), event: () => () => {}, timing: () => ({ start() {} }), spring: () => ({ start() {} }),
  createAnimatedComponent: (C) => C,
};
export const StyleSheet = { create: (s) => s, flatten: clean, hairlineWidth: 1, absoluteFill: {} };
export const Dimensions = { get: () => ({ width: 400, height: 800 }), addEventListener: () => ({ remove() {} }) };
export const Platform = { OS: "android", select: (o) => o.android ?? o.default };
export const AppState = { currentState: "active", addEventListener: () => ({ remove() {} }) };
export const BackHandler = { addEventListener: () => ({ remove() {} }) };
export const Alert = { alert() {} };
export const Keyboard = { addListener: () => ({ remove() {} }), dismiss() {} };
export const Linking = { openURL() {} };
export const useColorScheme = () => "light";
export const useWindowDimensions = () => ({ width: 400, height: 800, fontScale: 1 });
export const PixelRatio = { get: () => 1, getFontScale: () => 1 };
export const InteractionManager = { runAfterInteractions: (f) => f() };
export const LayoutAnimation = { configureNext() {}, Presets: {} };
export const NativeModules = {};
export const unstable_batchedUpdates = (f) => f();
export const I18nManager = { isRTL: false };
export default { View, Text };
export const Vibration = { vibrate() {} };
export const Easing = new Proxy({}, { get: () => () => (t) => t });
export const PanResponder = { create: () => ({ panHandlers: {} }) };
export const FlatList = box("div");
export const SectionList = box("div");
export const ActivityIndicator = box("div");
export const Switch = box("div");
export const KeyboardAvoidingView = box("div");
export const StatusBar = () => null;
export const TouchableOpacity = box("div");
export const TouchableWithoutFeedback = box("div");
export const Share = { share() {} };
export const PermissionsAndroid = { request: async () => "granted", PERMISSIONS: {} };
export const AccessibilityInfo = { isScreenReaderEnabled: async () => false, addEventListener: () => ({ remove() {} }) };
export const findNodeHandle = () => 0;
export const TurboModuleRegistry = { get: () => null };
