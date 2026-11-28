// The bridge between the store and React: one store for the application, hooks to read it, and
// `useCommand` that runs a command and tells the person, in their language, why it was refused.
import "../platform/crypto.ts";
import { createContext, useCallback, useContext, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { Alert, useColorScheme } from "react-native";
import type { AppState, Channel } from "../application/store.ts";
import type { LedgerTx } from "../domain/change.ts";
import type { Env } from "../domain/env.ts";
import { DomainError } from "../domain/errors.ts";
import { formatAmount } from "../domain/money.ts";
import type { LedgerData, Minor } from "../domain/types.ts";
import { translator, type Translator } from "../i18n/index.ts";
import { appStore } from "../platform/app-store.ts";
import { haptic } from "../platform/haptics.ts";
import { markActed } from "./quiet.ts";
import { useMaskSubscriber } from "./mask-scope.tsx";
import { buildPalette, type Palette } from "./theme.ts";

export { appStore };

export function useAppState(): AppState {
  const s = appStore();
  return useSyncExternalStore(s.subscribe, s.getState);
}

// The phase of the application for the root: the state itself while loading, failed or welcome, one constant while the ledger is open, so a
// change of the ledger (the eye included) does not draw the root and everything under it again.
const OPEN = { status: "ready" } as AppState;
export function useAppPhase(): AppState {
  const s = appStore();
  return useSyncExternalStore(s.subscribe, () => {
    const state = s.getState();
    return state.status === "ready" ? OPEN : state;
  });
}

const NO_POSTED: string[] = [];
// The operations posted by the application that the person has not seen yet (the same array until they change).
export function usePosted(): string[] {
  const s = appStore();
  return useSyncExternalStore(s.subscribe, () => {
    const state = s.getState();
    return state.status === "ready" ? state.posted : NO_POSTED;
  });
}

// The ledger of a ready application (screens are shown only then).
export function useLedger(): LedgerData {
  const state = useAppState();
  if (state.status !== "ready" && state.status !== "welcome") throw new Error("the ledger is not open");
  return state.data;
}

// The settings of two states of the ledger that differ only in the masking of the figures (the eye).
function sameSettingsButMask(a: LedgerData["settings"], b: LedgerData["settings"]): boolean {
  const x = a as unknown as Record<string, unknown>;
  const y = b as unknown as Record<string, unknown>;
  for (const key of new Set([...Object.keys(x), ...Object.keys(y)])) if (key !== "hidden" && x[key] !== y[key]) return false;
  return true;
}

// The ledger for what is worked out from it (the rows of a period, the report, the tiles): the same object while the only change is the
// masking of the figures (the eye), which changes none of them. Without it every page that is drawn (a period pager keeps five)
// worked its rows out again and gave its list new data at each tap on the eye (every operation filtered, sorted and
// grouped five times, the lists laid out again).
// What is drawn masked reads the masking from the money format (useMoney), not from here: do not read `settings.hidden` from this.
export function useLedgerView(): LedgerData {
  return useSyncExternalStore(subscribeView, viewSnapshot);
}
const VIEW_CHANNELS: Channel[] = ["ops", "refs", "look"];
const subscribeView = (l: () => void) => appStore().subscribe(l, VIEW_CHANNELS);
let viewKept: LedgerData | null = null;
function viewSnapshot(): LedgerData {
  const state = appStore().getState();
  if (state.status !== "ready" && state.status !== "welcome") throw new Error("the ledger is not open");
  if (viewKept && viewKept !== state.data && onlyMaskChanged(viewKept, state.data)) return viewKept;
  return (viewKept = state.data);
}
function onlyMaskChanged(a: LedgerData, b: LedgerData): boolean {
  for (const key of Object.keys(b) as (keyof LedgerData)[]) if (key !== "settings" && a[key] !== b[key]) return false;
  return sameSettingsButMask(a.settings, b.settings);
}

// One part of the ledger: the component draws again only when that part changes (an unchanged part keeps
// its identity), not on every change of the ledger. The part has to be a plain value or an object of the
// ledger itself, never a new object.
const LOOK_CHANNEL: Channel[] = ["look"];
const channelOf = (key: keyof LedgerData): Channel => (key === "ops" || key === "scheduled" ? "ops" : key === "settings" ? "look" : "refs");
const subscribeLook = (l: () => void) => appStore().subscribe(l, LOOK_CHANNEL);
export function useLedgerPart<T>(pick: (data: LedgerData) => T): T {
  const s = appStore();
  return useSyncExternalStore(subscribeLook, () => {
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
  const channels = useMemo(() => [...new Set(keys.map(channelOf))], [name]); // eslint-disable-line react-hooks/exhaustive-deps
  const subscribe = useCallback((l: () => void) => s.subscribe(l, channels), [s, channels]);
  return useSyncExternalStore(subscribe, () => {
    const state = s.getState();
    if (state.status !== "ready" && state.status !== "welcome") throw new Error("the ledger is not open");
    const data = state.data;
    const last = partsCache.get(name) as Pick<LedgerData, K> | undefined;
    // The settings count as unchanged when only the masking changed: what is drawn masked asks the masking itself (useMoney).
    if (last && keys.every((k) => last[k] === data[k] || (k === "settings" && sameSettingsButMask(last[k] as LedgerData["settings"], data[k] as LedgerData["settings"])))) return last;
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
// What the format of an amount is made of, without the masking.
interface MoneyFormat {
  currency: string;
  format: (n: Minor, code: string) => string;
}
const MoneyContext = createContext<MoneyFormat | null>(null);

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
  // The masking is not here: it changes on a tap of the eye and would draw every consumer of this context again (rows, icons,
  // heads of all the tabs, ~150 ms); useMoney asks the masking from the store itself, and what is drawn from `money` alone
  // (the amounts in the rows) is drawn again by its own small component (MoneyLine), not by the row.
  const { currency, numberFormat, groupDigits, decimal, hideCents, currencyFirst } = s;
  const money = useMemo<MoneyFormat>(() => {
    const format = { numberFormat, groupDigits, decimal, hideCents, currencyFirst };
    return { currency, format: (n, code) => formatAmount(n, code, format) };
  }, [currency, numberFormat, groupDigits, decimal, hideCents, currencyFirst]);
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
// The masking is read from the store (a short string that changes only when the eye does), so a component that formats money draws
// again on the eye, and one that does not format money does not.
const maskOf = (): string => {
  const state = appStore().getState();
  if (state.status !== "ready" && state.status !== "welcome") return "";
  const { hidden, hiddenValues } = state.data.settings;
  return hidden ? (hiddenValues === "Balances only" ? "balances" : "all") : "";
};
// Whether the figures are hidden (the eye): heard on the mask channel alone.
export function useHidden(): boolean {
  return useSyncExternalStore(useMaskSubscriber(), () => {
    const state = appStore().getState();
    return (state.status === "ready" || state.status === "welcome") && !!state.data.settings.hidden;
  });
}
export function useMoney(): Money {
  const { currency, format } = fromLook(useContext(MoneyContext));
  const mask = useSyncExternalStore(useMaskSubscriber(), maskOf);
  return useMemo<Money>(
    () =>
      (n, code = currency, balance = false) =>
        mask && (mask !== "balances" || balance) ? `•••• ${code}` : format(n, code),
    [currency, format, mask],
  );
}

// Runs a command; a refusal is shown as a message and the result is undefined.
export function useCommand(): <T>(command: (tx: LedgerTx, env: Env) => T) => T | undefined {
  const t = useT();
  return useCallback(
    <T,>(command: (tx: LedgerTx, env: Env) => T): T | undefined => {
      try {
        // Any command is the person doing something: the empty-state pictures stop replaying (ui/quiet.ts).
        markActed();
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
const showMessage = (text: string, title?: string): void => present(text, title);

// A refusal is also felt: the action did not happen.
export function showError(t: Translator, error: unknown): void {
  haptic("error");
  if (error instanceof DomainError) showMessage(t.t(error.message, error.params));
  else {
    console.error(error);
    showMessage(t.t("Nothing was changed. Please try again."), t.t("Something went wrong"));
  }
}
