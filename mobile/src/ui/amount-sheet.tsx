// The sheet that enters an amount with the calculator keypad (js/ui/number-picker.js `amountPicker`):
// the typed expression on top, operators in the first column, digits in the middle, backspace and a
// tall confirm key at the right ("=" while an operation waits to be calculated).
import { useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { Pressable } from "./pressable.tsx";
import { keypadDigits } from "../domain/keypad.ts";
import { evaluateExpression, typeKey } from "../domain/money.ts";
import { useLedger, usePalette, useT } from "./app-context.tsx";
import { toast } from "./dialogs.tsx";
import { Icon } from "./kit.tsx";
import { sheets, useCloseLayer } from "./sheets.tsx";
import { mix } from "./theme.ts";

function Key({ label, onPress, wide = 1, tall = false, confirm = false, disabled = false, children }: { label: string; onPress: () => void; wide?: number; tall?: boolean; confirm?: boolean; disabled?: boolean; children: ReactNode }) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ flex: wide, minHeight: tall ? 0 : 54, borderRadius: 15, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1, backgroundColor: confirm ? mix(p.accent, p.bg, 0.18) : pressed ? mix(p.accent, p.bg, 0.1) : p.key })}
    >
      {children}
    </Pressable>
  );
}

function AmountSheet({ title, value, currency, signed, onDone }: { title: string; value: number; currency: string; signed: boolean; onDone: (minor: number) => void }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const [expr, setExpr] = useState(String(value / 100));
  // The first digit typed over a shown value starts a new number; an operator continues it.
  const [fresh, setFresh] = useState(value !== 0);
  const data = useLedger();
  const digits = keypadDigits(data.settings.reverseKeys ?? false);
  const press = (k: string) => {
    try {
      const starts = fresh && /^[\d.]$/.test(k);
      setExpr(typeKey(expr, k, starts));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
    setFresh(false);
  };
  const pending = /\d[÷×−+]/.test(expr);
  const done = () => {
    try {
      const n = evaluateExpression(expr);
      if (n < 0 && !signed) throw new Error("Use a non-negative amount");
      close();
      onDone(n);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
  };
  const txt = (s: string, size = 29) => <Text style={{ color: p.ink, fontSize: size }}>{s}</Text>;
  const key = (s: string, size?: number) => (
    <Key key={s} label={s} onPress={() => press(s)}>
      {txt(s, size)}
    </Key>
  );
  const shown = expr.replace(/[\d.]+/g, (n) => `${n} ${currency || data.settings.currency}`).replace(/[÷×−+]/g, " $& ");
  const d = digits;
  return (
    <View>
      <Text style={{ color: p.muted, fontSize: 14, textAlign: "center" }}>{t.t(title)}</Text>
      <Text accessibilityLiveRegion="polite" style={{ color: p.ink, fontSize: 30, textAlign: "center", paddingVertical: 16 }} numberOfLines={2}>
        {shown}
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1, gap: 8 }}>
          {key("÷")}
          {key("×")}
          {key("−")}
          {key("+")}
        </View>
        <View style={{ flex: 3, gap: 8 }}>
          {[0, 3, 6].map((i) => (
            <View key={i} style={{ flexDirection: "row", gap: 8 }}>
              {[0, 1, 2].map((j) => key(d[i + j] as string))}
            </View>
          ))}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Key label="0" wide={2} onPress={() => press("0")}>
              {txt("0")}
            </Key>
            <Key label={t.t("Dot")} disabled={/\.\d*$/.test(expr)} onPress={() => press(".")}>
              {txt(".")}
            </Key>
          </View>
        </View>
        <View style={{ flex: 1, gap: 8 }}>
          <Key label={t.t("Backspace")} onPress={() => press("⌫")}>
            <Icon name="backspace" size={26} color={p.ink} />
          </Key>
          <Key label={t.t(pending ? "Calculate" : "Save")} confirm tall onPress={pending ? () => press("=") : done}>
            {pending ? <Text style={{ color: p.accentInk, fontSize: 32 }}>=</Text> : <Icon name="check" size={30} color={p.accentInk} />}
          </Key>
        </View>
      </View>
    </View>
  );
}

// `signed` allows a negative result; `currency` is the unit shown after each number.
export const openAmountSheet = (title: string, value: number, onDone: (minor: number) => void, signed = false, currency = ""): number =>
  sheets.open(<AmountSheet title={title} value={value} currency={currency} signed={signed} onDone={onDone} />, "sheet");
