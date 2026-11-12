// The screen lock: a PIN of 4 or 6 digits (and a fingerprint or face when the person allows it). It
// hides the application; it does not encrypt the data. Five wrong PINs in a row make the keys wait.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Animated, AppState as SystemAppState, Pressable, Text, View } from "react-native";
import { isValidPin, lockoutSeconds, makePin, pinMatches } from "../domain/pin.ts";
import { biometricAvailable, biometricUnlock, randomSalt, readPinRecord, writePinRecord } from "../platform/lock.ts";
import { appStore, useLedger, usePalette, useT } from "../ui/app-context.tsx";
import { Button, Icon } from "../ui/kit.tsx";
import { Panel } from "../ui/pickers.tsx";
import { mix, space } from "../ui/theme.ts";
import { toast } from "../ui/dialogs.tsx";

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

// Shows the lock screen instead of the application while it is locked.
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
  if (!pinSet(pin) || !state.locked) return <>{children}</>;
  return <LockScreen />;
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
      if (await biometricUnlock(t.t("Unlock Monivra"), t.t("Use PIN"))) unlock();
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
    <View style={{ flex: 1, backgroundColor: p.bg, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <View style={{ width: "100%", maxWidth: 310, alignItems: "center" }}>
        <Icon name="lock" size={42} color={p.ink} />
        <Text style={{ color: p.ink, fontSize: 24, fontWeight: "500", marginTop: 14, marginBottom: 14 }}>{t.t("Enter your PIN")}</Text>
        <PinPad
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
export function PinPad({ length, value, onChange, disabled = false, failed = false, left }: { length: number; value: string; onChange: (v: string) => void; disabled?: boolean; failed?: boolean; left?: ReactNode }) {
  const p = usePalette();
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
  const press = (k: string) => onChange(k === "⌫" ? value.slice(0, -1) : value.length < length ? value + k : value);
  const key = (k: string) => (
    <Pressable key={k} disabled={disabled} accessibilityRole="button" accessibilityLabel={k} onPress={() => press(k)} style={({ pressed }) => ({ flex: 1, minHeight: 65, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? p.soft : p.tint, opacity: disabled ? 0.4 : 1 })}>
      <Text style={{ color: p.ink, fontSize: 29 }}>{k}</Text>
    </Pressable>
  );
  const rows = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]];
  return (
    <View style={{ width: "100%", alignItems: "stretch" }}>
      <Animated.View accessibilityRole="image" accessibilityLabel={t.t("{typed} of {size} digits", { typed: value.length, size: length })} style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 18, height: 44, marginBottom: 16, transform: [{ translateX: shake }] }}>
        {Array.from({ length }, (_, i) => {
          const filled = i < value.length;
          return (
            <View key={i} style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: filled ? mix(p.accent, p.bg, 0.22) : "transparent" }}>
              <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: failed ? p.negative : filled ? p.accent : p.muted, backgroundColor: filled ? p.accent : "transparent" }} />
            </View>
          );
        })}
      </Animated.View>
      <View style={{ gap: 14, marginTop: 10 }}>
        {rows.map((r) => (
          <View key={r[0]} style={{ flexDirection: "row", gap: 14 }}>
            {r.map(key)}
          </View>
        ))}
        <View style={{ flexDirection: "row", gap: 14 }}>
          {left ?? <View style={{ flex: 1 }} />}
          {key("0")}
          <Pressable disabled={disabled} accessibilityRole="button" accessibilityLabel={t.t("Backspace")} onPress={() => press("⌫")} style={({ pressed }) => ({ flex: 1, minHeight: 65, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? p.soft : "transparent" })}>
            <Icon name="backspace" size={30} color={p.ink} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// Setting, changing or removing the PIN (from Settings).
export function PinSettings() {
  const data = useLedger();
  const t = useT();
  const [step, setStep] = useState<"off" | "new" | "repeat" | "check" | null>(null);
  const [length, setLength] = useState<4 | 6>(4);
  const [first, setFirst] = useState("");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const on = pinSet(data.settings.pin);
  const close = () => (setStep(null), setTyped(""), setFirst(""), setError(""));
  const save = (settings: Record<string, unknown>) => appStore().run((tx) => (tx.setSettings(settings), true));
  const typedAll = async (v: string) => {
    if (step === "new") {
      if (!isValidPin(v)) return setError(t.t("Only 4 or 6 digits"));
      setFirst(v);
      setTyped("");
      setStep("repeat");
    } else if (step === "repeat") {
      if (v !== first) {
        setError(t.t("The PINs do not match"));
        setTyped("");
        setStep("new");
        return;
      }
      await writePinRecord(makePin(v, randomSalt()));
      save({ pin: { v: 3, length: v.length } });
      setLock({ locked: false, failures: 0 });
      close();
    } else if (step === "check") {
      if (!pinMatches(await readPinRecord(), v)) {
        setError(t.t("Wrong PIN"));
        setTyped("");
        return;
      }
      await writePinRecord(null);
      save({ pin: false, biometric: false });
      close();
    }
  };
  const currentLength = on ? ((data.settings.pin as { length?: number }).length ?? 4) : 4;
  const padLength = step === "check" ? currentLength : length;
  return (
    <>
      <Button label={on ? "Turn off the PIN" : "Set a PIN"} kind="outline" onPress={() => setStep(on ? "check" : "new")} />
      <Panel visible={step !== null} title={step === "repeat" ? "Repeat the PIN" : step === "check" ? "Enter PIN" : "New PIN"} onClose={close}>
        <View style={{ padding: space.l, gap: space.m, alignItems: "center" }}>
          {step === "new" ? (
            <View style={{ flexDirection: "row", gap: space.s }}>
              <Button label="4 digits" kind={length === 4 ? "primary" : "outline"} onPress={() => (setLength(4), setTyped(""))} />
              <Button label="6 digits" kind={length === 6 ? "primary" : "outline"} onPress={() => (setLength(6), setTyped(""))} />
            </View>
          ) : null}
          {error ? <Text style={{ color: "#b93666" }}>{error}</Text> : null}
          <PinPad
            length={padLength}
            value={typed}
            onChange={(v) => {
              setTyped(v);
              setError("");
              if (v.length === padLength) void typedAll(v);
            }}
          />
        </View>
      </Panel>
    </>
  );
}
