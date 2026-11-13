// The one store of the application, opened on first use: the composition point of the platform
// (database, system clock, language of the phone) with the application layer.
import "./crypto.ts";
import { getLocales } from "expo-localization";
import { createStore, type Store } from "../application/store.ts";
import { systemEnv } from "../domain/env.ts";
import { openAppDatabase, setAsideDatabase } from "./database.ts";

// The language of the phone (for screens shown before the ledger is open).
export const phoneLanguage = (): string => getLocales()[0]?.languageCode ?? "en";

let store: Store | null = null;
export function appStore(): Store {
  if (!store) {
    store = createStore(openAppDatabase(), systemEnv, phoneLanguage, setAsideDatabase);
    store.open();
  }
  return store;
}
