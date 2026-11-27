// Bottom sheets and dialogs, stacked as in the first application (ui/navigation.js openSheet/openDialog):
// a layer opens over the screen, the next one over it, "back" closes the top one. The host is drawn
// inside the app (not in a native Modal), so the same insets and theme apply to every layer; the panel
// of a sheet adds the system's bottom inset to its own padding, and rises above the keyboard.
import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { Animated, BackHandler, Dimensions, PanResponder, ScrollView, StyleSheet, View } from "react-native";
import { Pressable } from "./pressable.tsx";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePalette } from "./app-context.tsx";
import { dismissKeyboard, useRevealFocusedField } from "./keyboard.tsx";
import { chrome } from "./theme.ts";
import { stopPictures } from "./picture-stop.ts";

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
  // A full page that a swipe down closes (an information page without its own scrolling).
  swipeDown: boolean;
  // Asked to close: when (the emulator test reads how long a layer takes to go) and what to do once it is gone.
  closeAsked?: number;
  then?: () => void;
}

interface SheetOptions {
  bare?: boolean;
  scrolls?: boolean;
  swipeDown?: boolean;
  // A layer opened to type in (it focuses its own field): the keyboard stays. Every other layer puts it away.
  keyboard?: boolean;
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
    // The field under the new layer cannot be typed in any more (ui/keyboard.tsx).
    if (!options.keyboard) dismissKeyboard();
    // The empty-state pictures on the JS driver would run under the layer and compete with it; they stop at rest (the tab
    // does not blur when a sheet or a dialog opens).
    stopPictures(true);
    const id = ++counter;
    publish([...layers, { id, kind, content, closing: false, bare: !!options.bare, scrolls: !!options.scrolls, swipeDown: !!options.swipeDown }]);
    return id;
  },
  // Starts closing a layer (the animation removes it).
  // `then` runs when the layer is gone (its closing animation is over): a change the layer's choice makes to the screen
  // below waits for it, so that the screen is not redrawn (on the JavaScript thread) while the layer is fading.
  close(id: number, then?: () => void): void {
    publish(layers.map((l) => (l.id === id && !l.closing ? { ...l, closing: true, then } : l)));
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

// `then` is typed loosely: the function is also passed straight to onPress, which hands it the press event (ignored below).
const LayerContext = createContext<(then?: unknown) => void>(() => undefined);
// Closes the layer the component is shown in (`then`: what to do once it is gone).
export const useCloseLayer = (): ((then?: unknown) => void) => useContext(LayerContext);

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
  const close = (then?: unknown) => sheets.close(layer.id, typeof then === "function" ? (then as () => void) : undefined);
  const reveal = useRevealFocusedField();

  useEffect(() => {
    Animated.timing(progress, { toValue: layer.closing ? 0 : 1, duration: layer.closing ? 160 : 220, useNativeDriver: true }).start(({ finished }) => {
      if (layer.closing && finished) {
        publish(layers.filter((l) => l.id !== layer.id));
        layer.then?.();
      }
    });
  }, [layer.closing, layer.id, progress]);

  const rise = progress.interpolate({ inputRange: [0, 1], outputRange: [Dimensions.get("window").height, 0] });
  // Dragging a page down follows the finger; past a third of a second's flick or 120 px it closes.
  const drag = useRef(new Animated.Value(0)).current;
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 14 && g.dy > Math.abs(g.dx) * 1.5,
      onPanResponderMove: (_e, g) => drag.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 120 || g.vy > 0.9) sheets.close(layer.id);
        else Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      },
      onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start(),
    }),
  ).current;
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
          <Animated.View {...(layer.swipeDown ? swipe.panHandlers : {})} style={{ ...StyleSheet.absoluteFill, backgroundColor: p.bg, paddingTop: insets.top, paddingBottom: insets.bottom, transform: [{ translateY: layer.swipeDown ? Animated.add(rise, drag) : rise }] }}>
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
                <ScrollView ref={reveal.ref} onScroll={reveal.onScroll} scrollEventThrottle={32} style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  {layer.content}
                </ScrollView>
              )}
            </Animated.View>
          ) : (
            <Animated.View
              style={{ opacity: progress, backgroundColor: p.dialog, borderRadius: chrome.dialogRadius, padding: 24, maxHeight: "91%" }}
            >
              <ScrollView ref={reveal.ref} onScroll={reveal.onScroll} scrollEventThrottle={32} style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">
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
