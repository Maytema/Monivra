// The bridge between the store and React: one store for the application, hooks to read it, and
// `useCommand` that runs a command and tells the person, in their language, why it was refused.
import "../platform/crypto.ts";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { Alert, useColorScheme } from "react-native";
import type { AppState } from "../application/store.ts";
import type { LedgerTx } from "../domain/change.ts";
import type { Env } from "../domain/env.ts";
import { DomainError } from "../domain/errors.ts";
import { formatAmount } from "../domain/money.ts";
import type { LedgerData, Minor } from "../domain/types.ts";
import { translator, type Translator } from "../i18n/index.ts";
import { appStore } from "../platform/app-store.ts";
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

const translators = new Map<string, Translator>();
export function useT(): Translator {
  const language = useLedgerPart((d) => d.settings.language);
  let t = translators.get(language);
  if (!t) translators.set(language, (t = translator(language)));
  return t;
}

export function usePalette(): Palette {
  const accent = useLedgerPart((d) => d.settings.accent);
  const theme = useLedgerPart((d) => d.settings.theme);
  const scheme = useColorScheme();
  const dark = theme === "dark" || (theme === "system" && scheme === "dark");
  return useMemo(() => buildPalette(accent, dark), [accent, dark]);
}

// Formats money with the person's settings; `balance` amounts are masked when values are hidden.
export function useMoney(): (n: Minor, currency?: string, balance?: boolean) => string {
  const s = useLedgerPart((d) => d.settings);
  return useCallback(
    (n, currency = s.currency, balance = false) =>
      s.hidden && (s.hiddenValues !== "Balances only" || balance) ? `•••• ${currency}` : formatAmount(n, currency, s),
    [s],
  );
}

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

export function showError(t: Translator, error: unknown): void {
  if (error instanceof DomainError) showMessage(t.t(error.message, error.params));
  else {
    console.error(error);
    showMessage(t.t("Nothing was changed. Please try again."), t.t("Something went wrong"));
  }
}
