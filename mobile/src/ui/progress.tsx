// "Preparing the report" and other work that takes a while (js/ui/file-actions.js withProgress): a dialog with
// the title, the progress in words and Cancel. Closing the dialog by any way (Cancel, back) stops the work.
import { useEffect, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import { usePalette, useT } from "./app-context.tsx";
import { TextButton } from "./calendar-sheet.tsx";
import { DialogActions, DialogTitle } from "./dialogs.tsx";
import { sheets, useCloseLayer } from "./sheets.tsx";

interface Progress {
  text: string;
  stop: AbortController;
  done: boolean;
  listeners: Set<() => void>;
}

function ProgressDialog({ title, progress }: { title: string; progress: Progress }) {
  const p = usePalette();
  const t = useT();
  const close = useCloseLayer();
  const text = useSyncExternalStore(
    (l) => (progress.listeners.add(l), () => void progress.listeners.delete(l)),
    () => progress.text,
  );
  useEffect(() => () => (progress.done ? undefined : progress.stop.abort()), [progress]);
  return (
    <View>
      <DialogTitle>{t.t(title)}</DialogTitle>
      <Text accessibilityLiveRegion="polite" style={{ color: p.inkSoft, fontSize: 15, lineHeight: 22, minHeight: 44 }}>
        {text}
      </Text>
      <DialogActions>
        <TextButton label="Cancel" onPress={close} />
      </DialogActions>
    </View>
  );
}

// Runs the work behind the dialog; the result is undefined when it was cancelled.
export async function withProgress<T>(title: string, firstText: string, work: (say: (text: string) => void, signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
  const progress: Progress = { text: firstText, stop: new AbortController(), done: false, listeners: new Set() };
  const id = sheets.open(<ProgressDialog title={title} progress={progress} />, "dialog");
  const say = (text: string) => {
    progress.text = text;
    progress.listeners.forEach((l) => l());
  };
  try {
    return await work(say, progress.stop.signal);
  } catch (error) {
    if (progress.stop.signal.aborted) return undefined;
    throw error;
  } finally {
    progress.done = true;
    sheets.close(id);
  }
}
