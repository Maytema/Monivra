// Payments far behind (js/screens/due-payments.js `askAboutMissed`): one question at a time, asked
// wherever the person is: add what was missed to the operations, or skip it and go on from the next
// occurrence. Until answered, a payment stays as it is.
import { Text, View } from "react-native";
import { translator } from "../i18n/index.ts";
import { missedPayments, settleMissed } from "../domain/scheduled.ts";
import { appStore, usePalette, useT } from "../ui/app-context.tsx";
import { PrimaryPill, TextButton } from "../ui/calendar-sheet.tsx";
import { DialogActions, DialogTitle } from "../ui/dialogs.tsx";
import { sheets, useCloseLayer } from "../ui/sheets.tsx";
import { operationTitle } from "./operation-row.tsx";

let asking = false;

function Question({ id, name, since, count }: { id: string; name: string; since: string; count: number }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const answer = (post: boolean) => {
    close();
    asking = false;
    const store = appStore();
    const posted = store.run((tx, env) => settleMissed(tx, id, post, env));
    store.notePosted(posted);
    askAboutMissed();
  };
  return (
    <View>
      <DialogTitle>{t.t("Missed payments")}</DialogTitle>
      <Text style={{ color: p.inkSoft, fontSize: 15, lineHeight: 22 }}>{t.t("“{name}” has not been added since {date} (payments: {n}). Add them to the operations?", { name, date: t.day(since, true), n: count })}</Text>
      <DialogActions>
        <TextButton label="Skip" onPress={() => answer(false)} />
        <PrimaryPill label="Add" onPress={() => answer(true)} />
      </DialogActions>
    </View>
  );
}

export function askAboutMissed(): void {
  if (asking) return;
  const store = appStore();
  const state = store.getState();
  if (state.status !== "ready") return;
  const [entry] = missedPayments(state.data.scheduled, store.env);
  if (!entry) return;
  const { item, count, since } = entry;
  asking = true;
  const name = operationTitle(state.data, item, translator(state.data.settings.language));
  sheets.open(<Question id={item.id} name={name} since={since} count={count} />, "dialog");
}
