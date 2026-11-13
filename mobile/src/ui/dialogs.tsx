// Small dialogs and the notice line (js/ui/dialogs.js, js/ui/primitives.js `toast`): a question with
// two buttons, a line of text to fill in, a list of options, and a short message at the bottom.
// They open on the same layer stack as sheets, so every window shares the insets and the theme.
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Text, TextInput, View } from "react-native";
import { Pressable } from "./pressable.tsx";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { setMessagePresenter, usePalette, useT } from "./app-context.tsx";
import { PrimaryPill, TextButton } from "./calendar-sheet.tsx";
import { sheets, useCloseLayer } from "./sheets.tsx";
import { Icon } from "./kit.tsx";
import { chrome, mix } from "./theme.ts";

export function DialogTitle({ children }: { children: ReactNode }) {
  const p = usePalette();
  return <Text style={{ color: p.ink, fontSize: 22, fontWeight: "500", marginBottom: 14 }}>{children}</Text>;
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 4, marginTop: 18 }}>{children}</View>;
}

// The confirmation of the first application (ui/dialogs.js `confirmAction`): a warning sign, "Are you
// sure?", what will happen, and two buttons one under the other — the action (red when it deletes) and
// Cancel.
function Confirm({ title, yes, danger, onYes, message, makeBackup }: { title: string; yes: string; danger: boolean; onYes: () => void; message?: string; makeBackup?: () => boolean }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const [backup, setBackup] = useState(false);
  const button = (label: string, onPress: () => void, look: "danger" | "primary" | "outline") => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 52,
        borderRadius: 30,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 18,
        marginTop: 14,
        opacity: pressed ? 0.85 : 1,
        borderWidth: look === "outline" ? 1 : 0,
        borderColor: p.line,
        backgroundColor: look === "danger" ? mix(p.negative, p.dialog, 0.16) : look === "primary" ? p.accent : "transparent",
      })}
    >
      <Text style={{ color: look === "danger" ? p.negativeInk : look === "primary" ? p.onAccent : p.ink, fontSize: 15, fontWeight: "500" }}>{t.t(label)}</Text>
    </Pressable>
  );
  return (
    <View>
      <View style={{ alignItems: "center" }}>
        <Icon name="warning" size={32} color={p.negative} />
      </View>
      <Text style={{ color: p.ink, fontSize: 22, textAlign: "center", marginTop: 10, marginBottom: 10 }}>{t.t("Are you sure?")}</Text>
      <Text style={{ color: p.ink, fontSize: 15, lineHeight: 21, textAlign: "center" }}>{t.t(title)}</Text>
      {message ? <Text style={{ color: p.inkSoft, fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: 8 }}>{message}</Text> : null}
      {makeBackup ? (
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: backup }} onPress={() => setBackup(!backup)} style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14, paddingVertical: 6 }}>
          <View style={{ width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: backup ? p.accent : p.muted, backgroundColor: backup ? p.accent : "transparent", alignItems: "center", justifyContent: "center" }}>
            {backup ? <Icon name="check" size={16} color={p.onAccent} /> : null}
          </View>
          <Text style={{ color: p.ink, fontSize: 15 }}>{t.t("Create a backup first")}</Text>
        </Pressable>
      ) : null}
      {button(yes, () => {
        close();
        if (backup && makeBackup && !makeBackup()) return void showInfo("The backup could not be stored because the storage is full. Nothing was changed. Save a data file instead, or delete older backups.", "Backup not made");
        onYes();
      }, danger ? "danger" : "primary")}
      {button("Cancel", close, "outline")}
    </View>
  );
}

// A question: the dangerous action is red and says what it does ("Delete").
export const confirmDialog = (title: string, onYes: () => void, danger = false, yes = "OK", message?: string, makeBackup?: () => boolean): number =>
  sheets.open(<Confirm title={title} yes={yes} danger={danger} onYes={onYes} message={message} makeBackup={makeBackup} />, "dialog");

// A message with OK (ui/dialogs.js showInfo).
function Info({ text, title }: { text: string; title?: string }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  return (
    <View>
      {title ? <DialogTitle>{t.t(title)}</DialogTitle> : null}
      <Text style={{ color: p.ink, fontSize: 16, lineHeight: 23 }}>{t.t(text)}</Text>
      <DialogActions>
        <TextButton label="OK" onPress={close} />
      </DialogActions>
    </View>
  );
}
export const showInfo = (text: string, title?: string): number => sheets.open(<Info text={text} title={title} />, "dialog");
setMessagePresenter((text, title) => void showInfo(text, title));

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

// What just happened (js/ui/primitives.js `notice`): a pill with an icon at the bottom edge for what went as
// expected ("quiet"), a card with a second line for what ended up somewhere else than one might think
// ("important"). With `onTap` it ends in an arrow, stays longer, and a tap leads on to what it is about.
export interface NoticeOptions {
  icon: string;
  tone?: "positive" | "negative" | "accent";
  level?: "quiet" | "important";
  detail?: string;
  onTap?: () => void;
}
const NOTICE_MS = { quiet: 1600, quietTap: 3200, important: 4500 } as const;
let current_notice: ({ id: number; text: string } & NoticeOptions) | null = null;
const noticeListeners = new Set<() => void>();
const subscribeNotice = (l: () => void) => (noticeListeners.add(l), () => void noticeListeners.delete(l));
export function notice(text: string, options: NoticeOptions): void {
  current_notice = { id: ++counter, text, ...options };
  noticeListeners.forEach((l) => l());
}

export function NoticeHost() {
  const current = useSyncExternalStore(subscribeNotice, () => current_notice);
  const p = usePalette();
  const t = useT();
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!current) return;
    setShown(current.id);
    const stay = current.level === "important" ? NOTICE_MS.important : current.onTap ? NOTICE_MS.quietTap : NOTICE_MS.quiet;
    const timer = setTimeout(() => setShown((id) => (id === current.id ? null : id)), stay);
    return () => clearTimeout(timer);
  }, [current]);
  if (!current || shown !== current.id) return null;
  const important = current.level === "important";
  const tone = current.tone === "positive" ? p.positiveInk : current.tone === "negative" ? p.negativeInk : p.accentInk;
  // Above the navigation bar and the floating button, so it never covers the list that just changed.
  const bottom = Math.max(chrome.navMinBottom, insets.bottom) + chrome.navPadTop + chrome.navItem + chrome.edgeGap + chrome.fab + 12;
  const body = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: important ? 16 : 14,
        paddingVertical: important ? 12 : 10,
        width: important ? "100%" : undefined,
        maxWidth: 420,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: mix(p.accent, p.bg, important ? 0.48 : 0.26),
        backgroundColor: mix(p.accent, p.sheet, 0.06),
        elevation: 4,
      }}
    >
      <Icon name={current.icon} size={important ? 28 : 18} color={tone} />
      <View style={{ flexShrink: 1 }}>
        <Text style={{ color: p.ink, fontSize: important ? 15 : 14, fontWeight: "500" }}>{t.t(current.text)}</Text>
        {current.detail ? <Text style={{ color: p.muted, fontSize: 13, marginTop: 1 }}>{current.detail}</Text> : null}
      </View>
      {current.onTap ? <Icon name="right" size={important ? 20 : 16} color={p.accentInk} /> : null}
    </View>
  );
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: chrome.edgeGap, right: chrome.edgeGap, bottom, alignItems: "center" }}>
      {current.onTap ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setShown(null);
            current.onTap?.();
          }}
          style={{ maxWidth: "100%", width: important ? "100%" : undefined }}
        >
          {body}
        </Pressable>
      ) : (
        <View pointerEvents="none" style={{ maxWidth: "100%", width: important ? "100%" : undefined }}>
          {body}
        </View>
      )}
    </View>
  );
}
