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

export function useT(): Translator {
  const data = useLedger();
  return useMemo(() => translator(data.settings.language), [data.settings.language]);
}

export function usePalette(): Palette {
  const data = useLedger();
  const scheme = useColorScheme();
  const dark = data.settings.theme === "dark" || (data.settings.theme === "system" && scheme === "dark");
  return useMemo(() => buildPalette(data.settings.accent, dark), [data.settings.accent, dark]);
}

// Formats money with the person's settings; `balance` amounts are masked when values are hidden.
export function useMoney(): (n: Minor, currency?: string, balance?: boolean) => string {
  const data = useLedger();
  const s = data.settings;
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

export function showError(t: Translator, error: unknown): void {
  if (error instanceof DomainError) Alert.alert(t.t(error.message, error.params));
  else {
    console.error(error);
    Alert.alert(t.t("Something went wrong"), t.t("Nothing was changed. Please try again."));
  }
}
