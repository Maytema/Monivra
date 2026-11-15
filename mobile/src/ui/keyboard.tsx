// The system keyboard must never cover what is being typed, on every page, sheet and dialog.
// `KeyboardPad` shortens the whole window by the part of it the keyboard covers. That part is measured against
// the window's own frame, not taken from the keyboard's height: whether the system already resized the window
// (adjustResize, gesture bar, three buttons) differs between phones, and padding by the height alone either
// leaves the keyboard over the field or leaves a gap above it.
// `useRevealFocusedField` goes on a scrolling body: when the keyboard comes up and the focused field lies below
// the keyboard's top edge, the body scrolls just far enough to bring it above — and only the body that holds
// the field does it.
import { PERF_BUILD, noteTouch } from "../platform/perf.ts";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Keyboard, TextInput, View, type KeyboardEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";

type Measure = { measureInWindow(done: (x: number, y: number, w: number, h: number) => void): void };

export function KeyboardPad({ children }: { children: ReactNode }) {
  const frame = useRef<Measure | null>(null);
  const [pad, setPad] = useState(0);
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", (e: KeyboardEvent) => {
      frame.current?.measureInWindow((_x, y, _w, h) => setPad(Math.max(0, Math.round(y + h - e.endCoordinates.screenY))));
    });
    const hidden = Keyboard.addListener("keyboardDidHide", () => setPad(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return (
    // The outer frame keeps the window's size (it is what is measured); the inner one is shortened by a margin, not
    // by padding: pages drawn with absolute positioning (the layers of ui/sheets.tsx) are placed against the box of
    // their parent, padding included, and would stay under the keyboard.
    <View ref={(node: unknown) => void (frame.current = node as Measure | null)} collapsable={false} style={{ flex: 1 }} onTouchStart={PERF_BUILD ? (e: { nativeEvent: { timestamp: number } }) => noteTouch(e.nativeEvent.timestamp) : undefined}>
      <View style={{ flex: 1, marginBottom: pad }}>{children}</View>
    </View>
  );
}

type Scrolling = Measure & { scrollTo(to: { y: number; animated: boolean }): void };

export function useRevealFocusedField() {
  const body = useRef<Scrolling | null>(null);
  const offset = useRef(0);
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", (e: KeyboardEvent) => {
      // After the window has been shortened.
      setTimeout(() => {
        const field = (TextInput as unknown as { State: { currentlyFocusedInput?: () => Measure | null } }).State.currentlyFocusedInput?.();
        if (!field || !body.current) return;
        const scroller = body.current;
        scroller.measureInWindow((_sx, top, _sw, height) => {
          field.measureInWindow((_x, y, _w, h) => {
            if (y < top || y > top + height) return; // the field is not in this body
            const visibleBottom = Math.min(top + height, e.endCoordinates.screenY) - 16;
            const over = y + h - visibleBottom;
            if (over > 0) scroller.scrollTo({ y: offset.current + over, animated: true });
          });
        });
      }, 160);
    });
    return () => shown.remove();
  }, []);
  return {
    ref: (node: unknown) => void (body.current = node as Scrolling | null),
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void (offset.current = e.nativeEvent.contentOffset.y),
  };
}
