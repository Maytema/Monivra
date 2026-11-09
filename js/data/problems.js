/* The words for a problem found in a data file, as one short sentence for the person */
import { translate } from "../i18n/index.js";

// Headings of the data sections, as the person sees them elsewhere in the app.
const SECTION_NAMES = {
  accounts: "Accounts",
  categories: "Categories",
  ops: "Operations",
  tags: "Tags",
  scheduled: "Scheduled payments",
  budgets: "Budgets",
  backups: "Backups",
};

// `problem` is { what, number, reason } as found by `findDataProblem`.
export function describeProblem({ what, number, reason }) {
  const text = translate(reason);
  if (what === "File") return text.charAt(0).toUpperCase() + text.slice(1);
  if (SECTION_NAMES[number])
    return `${translate(what)} «${translate(SECTION_NAMES[number])}»: ${text}`;
  return `${translate(what)} ${number || ""}`.trim() + ": " + text;
}
