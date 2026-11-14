// The bridge between the store and React: one store for the application, hooks to read it, and
// `useCommand` that runs a command and tells the person, in their language, why it was refused.
import "../platform/crypto.ts";
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { Alert, useColorScheme } from "react-native";
import type { AppState } from "../application/store.ts";
import type { LedgerTx } from "../domain/change.ts";
import type { Env } from "../domain/env.ts";
import { DomainError } from "../domain/errors.ts";
import { formatAmount } from "../domain/money.ts";
import type { LedgerData, Minor } from "../domain/types.ts";
import { translator, type Translator } from "../i18n/index.ts";
import { appStore } from "../platform/app-store.ts";
import { haptic } from "../platform/haptics.ts";
import { buildPalette, type Palette } from "./theme.ts";

export { appStore };

export function useAppState(): AppState {
  const s = appStore();
  return useSyncExternalStore(s.subscribe, s.getState);
}

// The ledger of a ready application (screens are shown only then).
export function useLedger(): LedgerData {
  const state = useAppState();
  if (state.status !== "ready" && state.status !== "welcome") throw new Error("the ledger is not open");
  return state.data;
}

// One part of the ledger: the component draws again only when that part changes (an unchanged part keeps
// its identity), not on every change of the ledger. The part has to be a plain value or an object of the
// ledger itself, never a new object.
export function useLedgerPart<T>(pick: (data: LedgerData) => T): T {
  const s = appStore();
  return useSyncExternalStore(s.subscribe, () => {
    const state = s.getState();
    if (state.status !== "ready" && state.status !== "welcome") throw new Error("the ledger is not open");
    return pick(state.data);
  });
}

// Several parts of the ledger as one object that keeps its identity while those parts are unchanged (the lists
// are replaced, never changed in place). A row of a list that needs the accounts and the categories is then
// not drawn again when an operation is saved.
const partsCache = new Map<string, Partial<LedgerData>>();
export function useLedgerParts<K extends keyof LedgerData>(...keys: K[]): Pick<LedgerData, K> {
  const s = appStore();
  const name = keys.join(" ");
  return useSyncExternalStore(s.subscribe, () => {
    const state = s.getState();
    if (state.status !== "ready" && state.status !== "welcome") throw new Error("the ledger is not open");
    const data = state.data;
    const last = partsCache.get(name) as Pick<LedgerData, K> | undefined;
    if (last && keys.every((k) => last[k] === data[k])) return last;
    const next = {} as Pick<LedgerData, K>;
    for (const k of keys) next[k] = data[k];
    partsCache.set(name, next);
    return next;
  });
}

// ---- The look: colours, language and money format ----------------------------------------------------
// They follow the settings and are the same for every component, so they are worked out once, in LedgerLook
// at the root, and read from context. (Each component used to subscribe to the store for them by itself:
// an icon alone held three subscriptions.)

type Money = (n: Minor, currency?: string, balance?: boolean) => string;
const PaletteContext = createContext<Palette | null>(null);
const TranslatorContext = createContext<Translator | null>(null);
const MoneyContext = createContext<Money | null>(null);

const translators = new Map<string, Translator>();
const translatorFor = (language: string, dateFormat: string): Translator => {
  const key = `${language} ${dateFormat}`;
  let t = translators.get(key);
  if (!t) translators.set(key, (t = translator(language, dateFormat)));
  return t;
};

export function LedgerLook({ children }: { children: ReactNode }) {
  const s = useLedgerPart((d) => d.settings);
  const scheme = useColorScheme();
  const dark = s.theme === "dark" || (s.theme === "system" && scheme === "dark");
  const palette = useMemo(() => buildPalette(s.accent, dark), [s.accent, dark]);
  const t = translatorFor(s.language, s.dateFormat);
  // Only what the format reads, so another setting (the note of the last rate update, say) changes nothing here.
  const { currency, hidden, hiddenValues, numberFormat, groupDigits, decimal, hideCents, currencyFirst } = s;
  const money = useMemo<Money>(() => {
    const format = { numberFormat, groupDigits, decimal, hideCents, currencyFirst };
    return (n, code = currency, balance = false) => (hidden && (hiddenValues !== "Balances only" || balance) ? `•••• ${code}` : formatAmount(n, code, format));
  }, [currency, hidden, hiddenValues, numberFormat, groupDigits, decimal, hideCents, currencyFirst]);
  return (
    <PaletteContext.Provider value={palette}>
      <TranslatorContext.Provider value={t}>
        <MoneyContext.Provider value={money}>{children}</MoneyContext.Provider>
      </TranslatorContext.Provider>
    </PaletteContext.Provider>
  );
}

function fromLook<T>(value: T | null): T {
  if (value === null) throw new Error("drawn outside LedgerLook");
  return value;
}
export const useT = (): Translator => fromLook(useContext(TranslatorContext));
export const usePalette = (): Palette => fromLook(useContext(PaletteContext));
// Formats money with the person's settings; `balance` amounts are masked when values are hidden.
export const useMoney = (): Money => fromLook(useContext(MoneyContext));

// Runs a command; a refusal is shown as a message and the result is undefined.
export function useCommand(): <T>(command: (tx: LedgerTx, env: Env) => T) => T | undefined {
  const t = useT();
  return useCallback(
    <T,>(command: (tx: LedgerTx, env: Env) => T): T | undefined => {
      try {
        return appStore().run(command);
      } catch (error) {
        showError(t, error);
        return undefined;
      }
    },
    [t],
  );
}

// Where messages are shown: the application's own dialog once the dialogs are loaded (ui/dialogs.tsx registers
// it), the system's alert before that and on the recovery screen.
let present: (text: string, title?: string) => void = (text, title) => (title ? Alert.alert(title, text) : Alert.alert(text));
export const setMessagePresenter = (show: (text: string, title?: string) => void): void => {
  present = show;
};
export const showMessage = (text: string, title?: string): void => present(text, title);

// A refusal is also felt: the action did not happen.
export function showError(t: Translator, error: unknown): void {
  haptic("error");
  if (error instanceof DomainError) showMessage(t.t(error.message, error.params));
  else {
    console.error(error);
    showMessage(t.t("Nothing was changed. Please try again."), t.t("Something went wrong"));
  }
}
