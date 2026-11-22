// What the person answered when asked to allow notifications (features/notification-ask.tsx): kept in the keystore
// next to the screen lock's record, so it is not asked again at every start.
import * as SecureStore from "expo-secure-store";

const KEY = "monivra.notification-ask";

export interface Answer {
  at: number;
  // "allowed": the system allowed it; "later": the person pushed it off; "refused": the system did not allow it.
  answer: "allowed" | "later" | "refused";
}

export async function readAnswer(): Promise<Answer | null> {
  try {
    const text = await SecureStore.getItemAsync(KEY);
    return text ? (JSON.parse(text) as Answer) : null;
  } catch {
    return null;
  }
}

export async function writeAnswer(answer: Answer["answer"]): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify({ at: Date.now(), answer } satisfies Answer));
  } catch {
    // Not kept: it will be asked once more, which does no harm.
  }
}
