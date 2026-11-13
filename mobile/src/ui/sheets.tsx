// Bottom sheets and dialogs, stacked as in the first application (ui/navigation.js openSheet/openDialog):
// a layer opens over the screen, the next one over it, "back" closes the top one. The host is drawn
// inside the app (not in a native Modal), so the same insets and theme apply to every layer; the panel
// of a sheet adds the system's bottom inset to its own padding, and rises above the keyboard.
import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { Animated, BackHandler, Dimensions, ScrollView, StyleSheet, View } from "react-native";
import { Pressable } from "./pressable.tsx";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePalette } from "./app-context.tsx";
import { chrome } from "./theme.ts";
import { now, perfLog } from "../platform/perf.ts";

// A "full" layer is a page over the whole screen (the icon list, the colour page).
type Kind = "sheet" | "dialog" | "full";
interface Layer {
  id: number;
  kind: Kind;
  content: ReactNode;
  closing: boolean;
  // A sheet whose content brings its own side padding (the add menu), with a taller panel.
  bare: boolean;
  // The content scrolls by itself (a long virtualized list must not sit inside another scroll view, or
  // every row of it is drawn at once).
  scrolls: boolean;
  // When it was asked for (the emulator test reads how long a layer takes to appear).
  asked: number;
}

export interface SheetOptions {
  bare?: boolean;
  scrolls?: boolean;
}

let layers: readonly Layer[] = [];
let counter = 0;
const listeners = new Set<() => void>();
const publish = (next: readonly Layer[]) => {
  layers = next;
  listeners.forEach((l) => l());
};

export const sheets = {
  // Opens a layer over the current ones; returns its id.
  open(content: ReactNode, kind: Kind = "sheet", options: SheetOptions = {}): number {
    const id = ++counter;
    publish([...layers, { id, kind, content, closing: false, bare: !!options.bare, scrolls: !!options.scrolls, asked: now() }]);
    return id;
  },
  // Starts closing a layer (the animation removes it).
  close(id: number): void {
    publish(layers.map((l) => (l.id === id ? { ...l, closing: true } : l)));
  },
  closeTop(): boolean {
    const top = [...layers].reverse().find((l) => !l.closing);
    if (top) this.close(top.id);
    return !!top;
  },
  closeAll(): void {
    publish(layers.map((l) => ({ ...l, closing: true })));
  },
  // Replaces the top layer's content (an account action replaces the account sheet).
  replaceTop(content: ReactNode, kind: Kind = "sheet", options: SheetOptions = {}): number {
    this.closeTop();
    return this.open(content, kind, options);
  },
  get count(): number {
    return layers.filter((l) => !l.closing).length;
  },
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const snapshot = () => layers;

const LayerContext = createContext<() => void>(() => undefined);
// Closes the layer the component is shown in.
export const useCloseLayer = (): (() => void) => useContext(LayerContext);

export function SheetHost() {
  const all = useSyncExternalStore(subscribe, snapshot);
  useEffect(() => {
    if (!all.length) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => sheets.closeTop());
    return () => sub.remove();
  }, [all.length]);
  if (!all.length) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: "box-none" }]}>
      {all.map((layer, index) => (
        <LayerView key={layer.id} layer={layer} first={index === 0} />
      ))}
    </View>
  );
}

function LayerView({ layer, first }: { layer: Layer; first: boolean }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const close = () => sheets.close(layer.id);

  useEffect(() => {
    if (!layer.closing) perfLog(`layer ${layer.kind} shown`, now() - layer.asked);
    Animated.timing(progress, { toValue: layer.closing ? 0 : 1, duration: layer.closing ? 160 : 220, useNativeDriver: true }).start(({ finished }) => {
      if (layer.closing && finished) publish(layers.filter((l) => l.id !== layer.id));
    });
  }, [layer.closing, layer.id, progress]);

  const rise = progress.interpolate({ inputRange: [0, 1], outputRange: [Dimensions.get("window").height, 0] });
  const veil = first ? "rgba(0,0,0,0.33)" : "rgba(0,0,0,0.2)";
  const sheet = layer.kind === "sheet";
  const full = layer.kind === "full";
  return (
    <LayerContext.Provider value={close}>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: veil, opacity: progress }]}>
          <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close" onPress={close} />
        </Animated.View>
        {full ? (
          <Animated.View style={{ ...StyleSheet.absoluteFill, backgroundColor: p.bg, paddingTop: insets.top, paddingBottom: insets.bottom, transform: [{ translateY: rise }] }}>
            {layer.content}
          </Animated.View>
        ) : (
        <View style={{ flex: 1, justifyContent: sheet ? "flex-end" : "center", padding: sheet ? 0 : 20, pointerEvents: "box-none" }}>
          {sheet ? (
            <Animated.View
              style={{
                transform: [{ translateY: rise }],
                maxHeight: "94%",
                backgroundColor: p.sheet,
                borderTopLeftRadius: chrome.sheetRadius,
                borderTopRightRadius: chrome.sheetRadius,
                paddingTop: layer.bare ? 11 : 10,
                paddingHorizontal: layer.bare ? 0 : 16 + Math.max(insets.left, insets.right),
                paddingBottom: (layer.bare ? 0 : 23) + insets.bottom,
                minHeight: layer.bare ? "45%" : undefined,
              }}
            >
              <View style={{ width: 32, height: 4, borderRadius: 8, backgroundColor: p.line, alignSelf: "center", marginBottom: layer.bare ? 8 : 12 }} />
              {layer.scrolls ? (
                <View style={{ flexShrink: 1 }}>{layer.content}</View>
              ) : (
                <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  {layer.content}
                </ScrollView>
              )}
            </Animated.View>
          ) : (
            <Animated.View
              style={{ opacity: progress, backgroundColor: p.dialog, borderRadius: chrome.dialogRadius, padding: 24, maxHeight: "91%" }}
            >
              <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">
                {layer.content}
              </ScrollView>
            </Animated.View>
          )}
        </View>
        )}
      </View>
    </LayerContext.Provider>
  );
}
