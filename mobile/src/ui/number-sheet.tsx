// The sheet with a digit keypad for a plain number (js/ui/number-picker.js `numberPicker`): an exchange rate or a
// day. `onDone` gets the typed text; returning false keeps the sheet open.
import { useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { Pressable } from "./pressable.tsx";
import { keypadDigits } from "../domain/keypad.ts";
import { useLedger, usePalette, useT } from "./app-context.tsx";
import { Icon } from "./kit.tsx";
import { sheets, useCloseLayer } from "./sheets.tsx";
import { mix } from "./theme.ts";

interface Options {
  decimal?: boolean;
  maxLength?: number;
}

function Key({ label, onPress, flex = 1, confirm = false, disabled = false, children }: { label: string; onPress: () => void; flex?: number; confirm?: boolean; disabled?: boolean; children: ReactNode }) {
  const p = usePalette();
  return (
    <Pressable feedback accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ flex, minHeight: 54, borderRadius: 15, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1, backgroundColor: confirm ? mix(p.accent, p.bg, 0.18) : pressed ? mix(p.accent, p.bg, 0.1) : p.key })}>
      {children}
    </Pressable>
  );
}

// The keys of a number sheet (js/ui/number-picker.js digitPadHtml): three columns of digits, the zero (and the dot) below,
// and a column with the backspace and the confirm check. Used by the number sheet and the PIN sheet.
export function DigitPad({ onKey, onConfirm, decimal = false, dotDisabled = false, confirmLabel = "Save" }: { onKey: (key: string) => void; onConfirm: () => void; decimal?: boolean; dotDisabled?: boolean; confirmLabel?: string }) {
  const data = useLedger();
  const p = usePalette();
  const t = useT();
  const digits = keypadDigits(data.settings.reverseKeys ?? false);
  const key = (d: string) => (
    <Key key={d} label={d} onPress={() => onKey(d)}>
      <Text style={{ color: p.ink, fontSize: 29 }}>{d}</Text>
    </Key>
  );
  const row = (i: number) => <View key={i} style={{ flexDirection: "row", gap: 8 }}>{[0, 1, 2].map((j) => key(digits[i + j] as string))}</View>;
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <View style={{ flex: 3, gap: 8 }}>
        {row(0)}
        {row(3)}
        {row(6)}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Key label="0" flex={decimal ? 2 : 3} onPress={() => onKey("0")}>
            <Text style={{ color: p.ink, fontSize: 29 }}>0</Text>
          </Key>
          {decimal ? (
            <Key label="." disabled={dotDisabled} onPress={() => onKey(".")}>
              <Text style={{ color: p.ink, fontSize: 29 }}>.</Text>
            </Key>
          ) : null}
        </View>
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        <Key label={t.t("Backspace")} onPress={() => onKey("⌫")}>
          <Icon name="backspace" size={26} color={p.ink} />
        </Key>
        <Pressable accessibilityRole="button" accessibilityLabel={t.t(confirmLabel)} onPress={onConfirm} style={{ flex: 1, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: mix(p.accent, p.bg, 0.18) }}>
          <Icon name="check" size={30} color={p.accentInk} />
        </Pressable>
      </View>
    </View>
  );
}

function NumberSheet({ title, value, options, onDone }: { title: string; value: string; options: Options; onDone: (text: string) => boolean | void }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const [text, setText] = useState(value);
  const [fresh, setFresh] = useState(value !== "");
  const press = (k: string) => {
    const base = fresh && k !== "⌫" ? "" : text;
    setFresh(false);
    if (k === "⌫") return setText(base.slice(0, -1));
    if (k === "." && (!options.decimal || base.includes("."))) return setText(base);
    if (base.length >= (options.maxLength ?? 12)) return setText(base);
    setText(base + (k === "." && !base ? "0." : k));
  };
  return (
    <View>
      <Text style={{ color: p.muted, fontSize: 14, textAlign: "center" }}>{t.t(title)}</Text>
      <Text accessibilityLiveRegion="polite" style={{ color: p.ink, fontSize: 32, textAlign: "center", paddingVertical: 16, minHeight: 72 }}>{text || " "}</Text>
      <DigitPad onKey={press} decimal={options.decimal} dotDisabled={text.includes(".")} onConfirm={() => onDone(text) !== false && close()} />
    </View>
  );
}

export const openNumberSheet = (title: string, value: string, onDone: (text: string) => boolean | void, options: Options = {}): number => sheets.open(<NumberSheet title={title} value={value} options={options} onDone={onDone} />, "sheet");
