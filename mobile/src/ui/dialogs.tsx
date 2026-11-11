// Small dialogs and the notice line (js/ui/dialogs.js, js/ui/primitives.js `toast`): a question with
// two buttons, a line of text to fill in, a list of options, and a short message at the bottom.
// They open on the same layer stack as sheets, so every window shares the insets and the theme.
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePalette, useT } from "./app-context.tsx";
import { PrimaryPill, TextButton } from "./calendar-sheet.tsx";
import { sheets, useCloseLayer } from "./sheets.tsx";

export function DialogTitle({ children }: { children: ReactNode }) {
  const p = usePalette();
  return <Text style={{ color: p.ink, fontSize: 22, fontWeight: "500", marginBottom: 14 }}>{children}</Text>;
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 4, marginTop: 18 }}>{children}</View>;
}

function Confirm({ title, yes, danger, onYes, message }: { title: string; yes: string; danger: boolean; onYes: () => void; message?: string }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  return (
    <View>
      <DialogTitle>{t.t(title)}</DialogTitle>
      {message ? <Text style={{ color: p.inkSoft, fontSize: 15, lineHeight: 22 }}>{message}</Text> : null}
      <DialogActions>
        <TextButton label="Cancel" onPress={close} />
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            close();
            onYes();
          }}
          style={{ paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999, backgroundColor: danger ? p.negative : p.accent }}
        >
          <Text style={{ color: danger ? "#ffffff" : p.onAccent, fontSize: 15, fontWeight: "600" }}>{t.t(yes)}</Text>
        </Pressable>
      </DialogActions>
    </View>
  );
}

// A question: the dangerous action is red and says what it does ("Delete").
export const confirmDialog = (title: string, onYes: () => void, danger = false, yes = "OK", message?: string): number =>
  sheets.open(<Confirm title={title} yes={yes} danger={danger} onYes={onYes} message={message} />, "dialog");

function Prompt({ title, initial, label, onDone }: { title: string; initial: string; label: string; onDone: (value: string) => void }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const [value, setValue] = useState(initial);
  return (
    <View>
      <DialogTitle>{t.t(title)}</DialogTitle>
      <TextInput
        autoFocus
        value={value}
        onChangeText={setValue}
        placeholder={t.t(label)}
        placeholderTextColor={p.muted}
        style={{ borderWidth: 1, borderColor: p.muted, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, color: p.ink, fontSize: 16 }}
      />
      <DialogActions>
        <TextButton label="Cancel" onPress={close} />
        <PrimaryPill
          label="OK"
          onPress={() => {
            close();
            onDone(value);
          }}
        />
      </DialogActions>
    </View>
  );
}

export const promptDialog = (title: string, initial: string, onDone: (value: string) => void, label = ""): number =>
  sheets.open(<Prompt title={title} initial={initial} label={label} onDone={onDone} />, "dialog");

export interface Choice<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

function Options<T extends string>({ title, options, value, onPick }: { title: string; options: readonly Choice<T>[]; value: T | undefined; onPick: (v: T) => void }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  return (
    <View>
      <DialogTitle>{t.t(title)}</DialogTitle>
      {options.map((o) => (
        <Pressable
          key={o.value}
          accessibilityRole="radio"
          accessibilityState={{ selected: o.value === value }}
          onPress={() => {
            close();
            onPick(o.value);
          }}
          style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12 }}
        >
          <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: o.value === value ? p.accent : p.muted, alignItems: "center", justifyContent: "center" }}>
            {o.value === value ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: p.accent }} /> : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: p.ink, fontSize: 16 }}>{t.t(o.label)}</Text>
            {o.hint ? <Text style={{ color: p.muted, fontSize: 13 }}>{t.t(o.hint)}</Text> : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

export const optionDialog = <T extends string>(title: string, options: readonly Choice<T>[], value: T | undefined, onPick: (v: T) => void): number =>
  sheets.open(<Options title={title} options={options} value={value} onPick={onPick} />, "dialog");

// ---- The notice line ----------------------------------------------------------------------------
let message: { id: number; text: string } | null = null;
let counter = 0;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
// A short message without an icon, for input mistakes and mode switches (3 s).
export function toast(text: string): void {
  message = { id: ++counter, text };
  listeners.forEach((l) => l());
}

export function ToastHost() {
  const current = useSyncExternalStore(subscribe, () => message);
  const p = usePalette();
  const t = useT();
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!current) return;
    setShown(current.id);
    const timer = setTimeout(() => setShown((id) => (id === current.id ? null : id)), 3000);
    return () => clearTimeout(timer);
  }, [current]);
  if (!current || shown !== current.id) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 16, right: 16, bottom: 24 + insets.bottom, alignItems: "center" }}>
      <View style={{ backgroundColor: p.ink, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12, maxWidth: "100%" }}>
        <Text style={{ color: p.bg, fontSize: 14 }}>{t.t(current.text)}</Text>
      </View>
    </View>
  );
}
