// Tabs whose pages slide under the finger, for every sheet that has a strip of tabs (the add menu, the
// pickers of a category or account): the underline is placed from the scroll offset on the native side, so
// it moves with the finger and with the animation after a tap, never after the page has settled. One
// logic for all of them (the accounts tab and the period pages use `Pager`, which also keeps neighbours).
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, ScrollView, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Pressable } from "./pressable.tsx";
import { usePalette, useT } from "./app-context.tsx";

interface Tab<T extends string> {
  id: T;
  label: string;
}

// The labels live apart from the pages so that the bold label can follow the scroll without redrawing them.
function Labels<T extends string>({ tabs, active, height, size, onPress, register }: { tabs: readonly Tab<T>[]; active: number; height: number; size: number; onPress: (i: number) => void; register: (set: (i: number) => void) => void }) {
  const p = usePalette();
  const t = useT();
  const [live, setLive] = useState(active);
  useEffect(() => {
    register(setLive);
    setLive(active);
  }, [active, register]);
  return (
    <>
      {tabs.map((tab, i) => (
        <Pressable key={tab.id} accessibilityRole="tab" accessibilityState={{ selected: live === i }} onPress={() => onPress(i)} style={{ flex: 1, height, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 }}>
          <Text style={{ color: p.ink, fontSize: size, fontWeight: live === i ? "600" : "500" }}>{t.t(tab.label)}</Text>
        </Pressable>
      ))}
    </>
  );
}

export function PagedTabs<T extends string>({ tabs, active, onChange, render, height = 48, size = 14 }: { tabs: readonly Tab<T>[]; active: T; onChange: (id: T) => void; render: (id: T) => ReactNode; height?: number; size?: number }) {
  const p = usePalette();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, tabs.findIndex((tab) => tab.id === active));
  const scroller = useRef<ScrollView | null>(null);
  const x = useRef(new Animated.Value(0)).current;
  const setLive = useRef<(i: number) => void>(() => undefined);
  const last = useRef(index);
  // The other pages are drawn a moment after the first, so the sheet opens as fast as one page.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 250);
    return () => clearTimeout(timer);
  }, []);
  // Only a new width puts the underline back; after that the scroll offset alone moves it.
  const at = useRef(index);
  at.current = index;
  useEffect(() => {
    if (width) x.setValue(at.current * width);
  }, [width, x]);
  const register = useCallback((set: (i: number) => void) => {
    setLive.current = set;
  }, []);
  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { x } } }], {
    useNativeDriver: true,
    listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.max(0, Math.min(tabs.length - 1, Math.round(e.nativeEvent.contentOffset.x / (width || 1))));
      if (i !== last.current) {
        last.current = i;
        setLive.current(i);
      }
    },
  });
  const tabWidth = width / tabs.length;
  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: p.line }}>
        <Labels tabs={tabs} active={index} height={height} size={size} register={register} onPress={(i) => {
            scroller.current?.scrollTo({ x: i * width, animated: true });
            const next = tabs[i];
            if (next && next.id !== active) onChange(next.id);
          }} />
        {width ? (
          <Animated.View
            pointerEvents="none"
            style={{ position: "absolute", bottom: -1, left: 0, height: 3, width: tabWidth, backgroundColor: p.accent, transform: [{ translateX: x.interpolate({ inputRange: [0, width * Math.max(1, tabs.length - 1)], outputRange: [0, tabWidth * Math.max(1, tabs.length - 1)] }) }] }}
          />
        ) : null}
      </View>
      {width ? (
        <Animated.ScrollView
          ref={(node: unknown) => {
            scroller.current = node as ScrollView | null;
          }}
          horizontal
          pagingEnabled
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onScroll}
          contentOffset={{ x: index * width, y: 0 }}
          onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
            const next = tabs[Math.round(e.nativeEvent.contentOffset.x / width)];
            if (next && next.id !== active) onChange(next.id);
          }}
        >
          {tabs.map((tab, i) => (
            <View key={tab.id} style={{ width }}>
              {i === index || ready ? render(tab.id) : null}
            </View>
          ))}
        </Animated.ScrollView>
      ) : null}
    </View>
  );
}
