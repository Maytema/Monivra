// What a chunked write (a restore, an import) is doing, in words for the progress window.
import type { Step } from "../application/store.ts";
import type { Translator } from "../i18n/index.ts";

export function stepText(t: Translator, step: Step): string {
  const part: Record<Step["what"], string> = {
    clearing: "Clearing the old data…",
    accounts: "Writing accounts: {done} of {total}",
    categories: "Writing categories: {done} of {total}",
    operations: "Writing operations: {done} of {total}",
    scheduled: "Writing scheduled payments: {done} of {total}",
    budgets: "Writing budgets: {done} of {total}",
    settings: "Writing settings…",
    checking: "Checking what was written…",
  };
  return t.t(part[step.what], { done: step.done, total: step.total });
}
