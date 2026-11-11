// The one store of the application, opened on first use: the composition point of the platform
// (database, system clock, language of the phone) with the application layer.
import "./crypto.ts";
import { getLocales } from "expo-localization";
import { createStore, type Store } from "../application/store.ts";
import { systemEnv } from "../domain/env.ts";
import { openAppDatabase } from "./database.ts";

let store: Store | null = null;
export function appStore(): Store {
  if (!store) {
    const language = () => getLocales()[0]?.languageCode ?? "en";
    store = createStore(openAppDatabase(), systemEnv, language);
    store.open();
  }
  return store;
}
