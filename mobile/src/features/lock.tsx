// The screen lock: a PIN of 4 or 6 digits (and a fingerprint or face when the person allows it). It
// hides the application; it does not encrypt the data. Five wrong PINs in a row make the keys wait.
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { AppState as SystemAppState, Pressable, Text, View } from "react-native";
import { isValidPin, lockoutSeconds, makePin, pinMatches } from "../domain/pin.ts";
import { biometricUnlock, randomSalt, readPinRecord, writePinRecord } from "../platform/lock.ts";
import { appStore, useLedger, usePalette, useT } from "../ui/app-context.tsx";
import { Button, Icon } from "../ui/kit.tsx";
import { Panel } from "../ui/pickers.tsx";
import { font, space } from "../ui/theme.ts";

// ---- Lock state (lives while the application runs) ------------------------------------------------
let lock = { locked: true, failures: 0, waitUntil: 0 };
const listeners = new Set<() => void>();
const setLock = (patch: Partial<typeof lock>) => {
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

function LockScreen() {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const state = useLock();
  const length = (data.settings.pin as { length?: number }).length ?? 4;
  const [typed, setTyped] = useState("");
  const [now, setNow] = useState(Date.now());
  const waiting = Math.max(0, Math.ceil((state.waitUntil - now) / 1000));
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);
  const tryBiometric = async () => {
    if (data.settings.biometric && (await biometricUnlock(t.t("Unlock Monivra"), t.t("Use PIN")))) setLock({ locked: false, failures: 0 });
  };
  useEffect(() => {
    void tryBiometric();
    // Asked once when the lock screen appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const complete = async (pin: string) => {
    const record = await readPinRecord();
    if (pinMatches(record, pin)) return setLock({ locked: false, failures: 0, waitUntil: 0 });
    const failures = state.failures + 1;
    setLock({ failures, waitUntil: Date.now() + lockoutSeconds(failures) * 1000 });
    setNow(Date.now());
    setTyped("");
  };
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.l }}>
      <Icon name="lock" size={40} color={p.accentInk} />
      <Text style={{ color: p.ink, fontSize: font.title }}>{t.t("Enter PIN")}</Text>
      {state.failures ? <Text style={{ color: p.negativeInk }}>{waiting ? t.t("Try again in {n} s", { n: waiting }) : t.t("Wrong PIN")}</Text> : null}
      <PinPad
        length={length}
        value={typed}
        disabled={waiting > 0}
        onChange={(v) => {
          setTyped(v);
          if (v.length === length) void complete(v);
        }}
      />
      {data.settings.biometric ? <Button label="Use fingerprint" kind="text" onPress={() => void tryBiometric()} /> : null}
    </View>
  );
}

// Dots and the digit keys.
export function PinPad({ length, value, onChange, disabled = false }: { length: number; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const p = usePalette();
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
  return (
    <View style={{ alignItems: "center", gap: space.l }}>
      <View style={{ flexDirection: "row", gap: 14 }}>
        {Array.from({ length }, (_, i) => (
          <View key={i} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: i < value.length ? p.accent : p.line }} />
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", width: 264, gap: 12 }}>
        {keys.map((k, i) => (
          <Pressable
            key={i}
            disabled={!k || disabled}
            onPress={() => onChange(k === "⌫" ? value.slice(0, -1) : value.length < length ? value + k : value)}
            style={({ pressed }) => ({ width: 80, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", backgroundColor: k ? (pressed ? p.soft : p.key) : "transparent", opacity: disabled ? 0.4 : 1 })}
          >
            <Text style={{ color: p.ink, fontSize: 24 }}>{k}</Text>
          </Pressable>
        ))}
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
