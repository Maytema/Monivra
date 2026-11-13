// The screen lock: a PIN of 4 or 6 digits (and a fingerprint or face when the person allows it). It
// hides the application; it does not encrypt the data. Five wrong PINs in a row make the keys wait.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Animated, AppState as SystemAppState, Text, View } from "react-native";
import { Pressable } from "../ui/pressable.tsx";
import { lockoutSeconds, makePin, pinMatches } from "../domain/pin.ts";
import { biometricAvailable, biometricUnlock, randomSalt, readPinRecord, writePinRecord } from "../platform/lock.ts";
import { appStore, useLedger, usePalette, useT } from "../ui/app-context.tsx";
import { Icon } from "../ui/kit.tsx";
import { SwitchRow } from "../ui/rows.tsx";
import { mix } from "../ui/theme.ts";
import { DialogTitle, toast } from "../ui/dialogs.tsx";
import { DigitPad } from "../ui/number-sheet.tsx";
import { sheets, useCloseLayer } from "../ui/sheets.tsx";

// ---- Lock state (lives while the application runs) ------------------------------------------------
let lock = { locked: true, failures: 0, waitUntil: 0 };
const listeners = new Set<() => void>();
export const setLock = (patch: Partial<typeof lock>) => {
  lock = { ...lock, ...patch };
  for (const fn of listeners) fn();
};
const useLock = () =>
  useSyncExternalStore(
    (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    () => lock,
  );

const pinSet = (pin: unknown): boolean => !!pin && typeof pin === "object";

// Shows the lock screen over the application while it is locked.
export function LockGate({ children }: { children: ReactNode }) {
  const data = useLedger();
  const state = useLock();
  const { pin, relock, lockDelay } = data.settings;
  useEffect(() => {
    let hiddenAt = 0;
    const sub = SystemAppState.addEventListener("change", (s) => {
      if (s === "background") hiddenAt = Date.now();
      if (s === "active" && pinSet(pin) && relock && hiddenAt && (Date.now() - hiddenAt) / 1000 >= (lockDelay || 0)) setLock({ locked: true });
    });
    return () => sub.remove();
  }, [pin, relock, lockDelay]);
  const locked = pinSet(pin) && state.locked;
  // The application stays mounted under the lock screen, so after the PIN the person is on the same screen
  // (the first application drew the lock screen over it); it is hidden from touch and from screen readers.
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }} pointerEvents={locked ? "none" : "auto"} importantForAccessibility={locked ? "no-hide-descendants" : "auto"} accessibilityElementsHidden={locked}>
        {children}
      </View>
      {locked ? (
        <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}>
          <LockScreen />
        </View>
      ) : null}
    </View>
  );
}

// The prompt of the fingerprint shows by itself once each time the screen locks; after that only the
// fingerprint key (bottom left of the keys) shows it, so cancelling it leaves the person on the keys
// and not in a loop (js/screens/more/lock.js).
let promptedThisLock = false;
let prompting = false;

function LockScreen() {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const state = useLock();
  const length = (data.settings.pin as { length?: number }).length ?? 4;
  const [typed, setTyped] = useState("");
  const [failed, setFailed] = useState(false);
  const [canBiometric, setCanBiometric] = useState(false);
  const wanted = !!data.settings.biometric;
  const unlock = () => {
    promptedThisLock = false;
    setLock({ locked: false, failures: 0, waitUntil: 0 });
  };
  const promptBiometric = async () => {
    if (prompting || !wanted) return;
    prompting = true;
    try {
      const result = await biometricUnlock(t.t("Unlock Monivra"), t.t("Use PIN"));
      if (result === "ok") unlock();
      else if (result === "lockout") toast(t.t("Too many fingerprint attempts. Use your PIN."));
      else if (result === "failed") toast(t.t("Fingerprint or face could not be used. Use your PIN."));
    } finally {
      prompting = false;
    }
  };
  useEffect(() => {
    let live = true;
    void biometricAvailable().then((ok) => {
      if (!live) return;
      setCanBiometric(ok);
      if (ok && wanted && !promptedThisLock) {
        promptedThisLock = true;
        void promptBiometric();
      }
    });
    return () => {
      live = false;
    };
    // Asked once when the lock screen appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);
  const complete = async (pin: string) => {
    if (Date.now() < state.waitUntil) {
      toast(t.t("Too many attempts. Try again in {n} s.", { n: Math.ceil((state.waitUntil - Date.now()) / 1000) }));
      setFailed(true);
      setTyped("");
      return;
    }
    const record = await readPinRecord();
    if (pinMatches(record, pin)) return unlock();
    const failures = state.failures + 1;
    const wait = lockoutSeconds(failures);
    setLock({ failures, waitUntil: Date.now() + wait * 1000 });
    toast(wait ? t.t("Too many attempts. Try again in {n} s.", { n: wait }) : t.t("Incorrect PIN"));
    setFailed(true);
    setTyped("");
  };
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingTop: 110, paddingBottom: 40 }}>
      <View style={{ alignItems: "center" }}>
        <Icon name="dollar" size={80} color={p.ink} />
        <Text style={{ color: p.ink, fontSize: 22, marginTop: 50, marginBottom: 26 }}>{t.t("Enter your PIN")}</Text>
        <PinDots length={length} value={typed} failed={failed} big />
      </View>
      <View style={{ width: "100%", maxWidth: 290 }}>
        <PinPad
          big
          hideDots
          length={length}
          value={typed}
          failed={failed}
          left={
            wanted && canBiometric ? (
              <Pressable accessibilityRole="button" accessibilityLabel={t.t("Unlock with fingerprint or face")} onPress={() => void promptBiometric()} style={({ pressed }) => ({ flex: 1, minHeight: 65, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? p.soft : "transparent" })}>
                <Icon name="fingerprint" size={30} color={p.ink} />
              </Pressable>
            ) : undefined
          }
          onChange={(v) => {
            setFailed(false);
            setTyped(v);
            if (v.length === length) void complete(v);
          }}
        />
      </View>
    </View>
  );
}

// The dots and the keys of a PIN (css/more.css .pin, .pin-dots): rings that fill with the accent and a
// soft halo, a shake after a wrong PIN; three columns of keys 65 dp high with 17 dp corners, the
// backspace a bare icon on the right, `left` the key at the bottom left (the fingerprint).
// One dot of the entered PIN: when a digit arrives it pops (a quick swell and settle) and takes the accent
// colour with a soft halo that fades; deleting a digit fades it back. Used by the lock screen and by every
// page that sets a PIN.
function PinDot({ filled, failed, big }: { filled: boolean; failed: boolean; big: boolean }) {
  const p = usePalette();
  const fill = useRef(new Animated.Value(filled ? 1 : 0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const halo = useRef(new Animated.Value(0)).current;
  const first = useRef(true);
  useEffect(() => {
    Animated.timing(fill, { toValue: filled ? 1 : 0, duration: 140, useNativeDriver: false }).start();
    if (first.current) return void (first.current = false);
    if (!filled) return;
    pop.setValue(0.7);
    halo.setValue(1);
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 220, useNativeDriver: true }),
      Animated.timing(halo, { toValue: 0, duration: 420, useNativeDriver: true }),
    ]).start();
  }, [filled, fill, pop, halo]);
  const size = big ? 20 : 18;
  const empty = big ? mix(p.muted, p.bg, 0.35) : "transparent";
  const color = failed ? p.negative : p.accent;
  const backgroundColor = fill.interpolate({ inputRange: [0, 1], outputRange: [empty, color] });
  const ring = big ? 0 : 2;
  return (
    <View style={{ width: 30, height: 30, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={{ position: "absolute", width: 30, height: 30, borderRadius: 15, backgroundColor: mix(color, p.bg, 0.3), opacity: halo, transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] }) }] }} />
      <Animated.View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: ring, borderColor: filled ? color : failed ? p.negative : p.muted, backgroundColor, transform: [{ scale: pop }] }} />
    </View>
  );
}

export function PinDots({ length, value, failed = false, big = false }: { length: number; value: string; failed?: boolean; big?: boolean }) {
  const t = useT();
  const shake = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!failed) return;
    Animated.sequence([
      Animated.timing(shake, { toValue: -8, duration: 80, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 8, duration: 120, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 80, useNativeDriver: true }),
    ]).start();
  }, [failed, shake]);
  return (
    <Animated.View accessibilityRole="image" accessibilityLabel={t.t("{typed} of {size} digits", { typed: value.length, size: length })} style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: big ? 22 : 16, height: big ? 30 : 44, marginBottom: big ? 0 : 16, transform: [{ translateX: shake }] }}>
      {Array.from({ length }, (_, i) => (
        <PinDot key={i} filled={i < value.length} failed={failed} big={big} />
      ))}
    </Animated.View>
  );
}

export function PinPad({ length, value, onChange, disabled = false, failed = false, left, big = false, hideDots = false }: { big?: boolean; hideDots?: boolean; length: number; value: string; onChange: (v: string) => void; disabled?: boolean; failed?: boolean; left?: ReactNode }) {
  const p = usePalette();
  const t = useT();
  const press = (k: string) => onChange(k === "⌫" ? value.slice(0, -1) : value.length < length ? value + k : value);
  const keyH = big ? 80 : 65;
  const gap = big ? 16 : 14;
  const key = (k: string) => (
    <Pressable feedback key={k} disabled={disabled} accessibilityRole="button" accessibilityLabel={k} onPress={() => press(k)} style={({ pressed }) => ({ flex: 1, minHeight: keyH, borderRadius: big ? 20 : 17, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? p.soft : p.tint, opacity: disabled ? 0.4 : 1 })}>
      <Text style={{ color: p.ink, fontSize: big ? 34 : 29 }}>{k}</Text>
    </Pressable>
  );
  const rows = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]];
  return (
    <View style={{ width: "100%", alignItems: "stretch" }}>
      {hideDots ? null : <PinDots length={length} value={value} failed={failed} />}
      <View style={{ gap, marginTop: big ? 0 : 10 }}>
        {rows.map((r) => (
          <View key={r[0]} style={{ flexDirection: "row", gap }}>
            {r.map(key)}
          </View>
        ))}
        <View style={{ flexDirection: "row", gap }}>
          {left ?? <View style={{ flex: 1 }} />}
          {key("0")}
          <Pressable feedback disabled={disabled} accessibilityRole="button" accessibilityLabel={t.t("Backspace")} onPress={() => press("⌫")} style={({ pressed }) => ({ flex: 1, minHeight: keyH, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? p.soft : "transparent" })}>
            <Icon name="backspace" size={big ? 36 : 30} color={p.ink} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// Setting or removing the PIN (js/screens/more/settings-pages.js pinSetup): one bottom sheet like the amount keypad.
// The fields on top show the typed digits as dots, the keys below type into the active field (tap a field to
// choose it). Only digits, at most six; a wrong count or a wrong confirmation is said at once.
const PIN_LENGTHS = [4, 6];

function PinField({ label, hint, dots, active, invalid, onPress }: { label: string; hint?: string; dots: number; active: boolean; invalid: boolean; onPress: () => void }) {
  const p = usePalette();
  const t = useT();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t.t(label)} accessibilityState={{ selected: active }} onPress={onPress} style={{ minHeight: 64, justifyContent: "center", paddingHorizontal: 16, marginTop: 10, borderRadius: 16, borderWidth: active || invalid ? 2 : 1, borderColor: invalid ? p.negative : active ? p.accent : p.line, backgroundColor: p.bg }}>
      <Text style={{ color: p.muted, fontSize: 13 }}>{t.t(label)}</Text>
      {dots ? <Text style={{ color: p.ink, fontSize: 22, letterSpacing: 3 }}>{"•".repeat(dots)}</Text> : hint ? <Text style={{ color: p.muted, fontSize: 14 }}>{t.t(hint)}</Text> : <Text style={{ color: p.ink, fontSize: 20 }}>—</Text>}
    </Pressable>
  );
}

function PinSetup({ remove, length }: { remove: boolean; length: number }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const [values, setValues] = useState({ first: "", second: "" });
  const [active, setActive] = useState<"first" | "second">("first");
  const [tried, setTried] = useState(false); // the check was pressed with a first PIN of a wrong length
  const size = remove ? length : Math.max(...PIN_LENGTHS);
  const { first, second } = values;
  const problem = remove
    ? ""
    : first && !PIN_LENGTHS.includes(first.length) && (tried || first.length === 5)
      ? "Enter 4 or 6 digits"
      : second && second.length >= first.length && second !== first
        ? "PINs do not match"
        : "";
  const save = (settings: Record<string, unknown>) => appStore().run((tx) => (tx.setSettings(settings), true));
  const finish = async () => {
    if (remove) {
      if (!pinMatches(await readPinRecord(), first)) return void toast(t.t("Incorrect PIN"));
      await writePinRecord(null);
      save({ pin: false, biometric: false });
    } else {
      await writePinRecord(makePin(first, randomSalt()));
      // A person who turns the lock on expects the application to lock when it is left, so a new PIN also
      // switches that on.
      save({ pin: { v: 3, length: first.length }, relock: true });
      setLock({ locked: false, failures: 0 });
    }
    close();
  };
  const confirm = () => {
    if (!remove && active === "first") {
      if (!PIN_LENGTHS.includes(first.length)) return setTried(true);
      return setActive("second");
    }
    if (!remove && second !== first) return;
    if (remove && !first) return void toast(t.t("Enter 4 or 6 digits"));
    void finish();
  };
  const press = (k: string) => {
    const text = values[active];
    const next = k === "⌫" ? text.slice(0, -1) : /^\d$/.test(k) && text.length < size ? text + k : text;
    setValues({ ...values, [active]: next });
    setTried(false);
    // A full first PIN passes on to the confirmation by itself.
    if (!remove && active === "first" && next.length === size) setActive("second");
  };
  return (
    <View>
      <DialogTitle>{t.t(remove ? "Turn off PIN" : "Set PIN")}</DialogTitle>
      <PinField label={remove ? "Current PIN" : "New PIN"} hint={remove ? undefined : "Enter 4 or 6 digits"} dots={first.length} active={active === "first"} invalid={!!first && problem === "Enter 4 or 6 digits"} onPress={() => setActive("first")} />
      {remove ? null : <PinField label="Confirm PIN" hint="Enter 4 or 6 digits" dots={second.length} active={active === "second"} invalid={problem === "PINs do not match"} onPress={() => setActive("second")} />}
      {problem ? <Text accessibilityRole="alert" style={{ color: p.negative, fontSize: 14, marginTop: 8 }}>{t.t(problem)}</Text> : null}
      <View style={{ marginTop: 14 }}>
        <DigitPad onKey={press} onConfirm={confirm} confirmLabel="Save" />
      </View>
      <Text style={{ color: p.muted, fontSize: 13, lineHeight: 19, marginTop: 12 }}>{t.t("The PIN only hides the screen; data on the device is not encrypted.")}</Text>
    </View>
  );
}

// The switch of the PIN (Settings → Security).
export function PinSettings() {
  const data = useLedger();
  const on = pinSet(data.settings.pin);
  const length = on ? ((data.settings.pin as { length?: number }).length ?? 4) : 4;
  return <SwitchRow label="PIN code" value={on} onChange={() => sheets.open(<PinSetup remove={on} length={length} />, "sheet")} />;
}
