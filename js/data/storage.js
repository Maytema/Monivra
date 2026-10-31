/* Data validation and persistence */
import { MAX_INTERVAL, STORAGE_KEY } from "../core/constants.js";
import { appData } from "../core/state.js";
import { isSupportedLanguage } from "../i18n/index.js";
import { toast } from "../ui/primitives.js";

const COLOR = /^#[a-f0-9]{6}$/i;
const knownRate = (x, code) => Number.isFinite(x.rates[code]) && x.rates[code] > 0;
// A problem found in a data file: which record it is and what is wrong with it.
const problem = (what, number, reason) => ({ what, number, reason });
// True for a real calendar date written as YYYY-MM-DD.
const validDate = (s) =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s + "T12:00:00Z")) &&
  new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s;
// Why an operation is not valid, or null.
function operationProblem(o, x, accountIds, categories, seen) {
  if (typeof o.id !== "string" || seen.has(o.id)) return "it has no unique id";
  if (!["income", "expense", "transfer", "adjustment"].includes(o.type)) return "unknown type";
  if (!Number.isSafeInteger(o.amount) || o.amount <= 0)
    return "the amount must be greater than zero";
  if (!validDate(o.date)) return "the date is not valid";
  if (!Array.isArray(o.tags) || o.tags.some((t) => typeof t !== "string"))
    return "tags are not valid";
  if (typeof o.comment !== "string") return "the comment is not valid";
  if (o.type === "adjustment") {
    if (!accountIds.has(o.from || o.to) || !!o.from === !!o.to) return "the account is not found";
  } else if (o.type === "transfer") {
    if (!accountIds.has(o.from) || !accountIds.has(o.to)) return "the account is not found";
    if (o.from === o.to) return "a transfer needs two different accounts";
    if (!Number.isSafeInteger(o.receive) || o.receive <= 0)
      return "the received amount must be greater than zero";
  } else {
    if ((o.type === "expense" && o.to) || (o.type === "income" && o.from))
      return "the account does not fit the type";
    if (!accountIds.has(o.type === "expense" ? o.from : o.to)) return "the account is not found";
    if (!categories.has(o.category)) return "the category is not found";
    if (categories.get(o.category).type !== o.type) return "the category does not fit the type";
  }
  if (o.photo && !/^data:image\/(jpeg|png|webp|gif);base64,[a-z0-9+/=]+$/i.test(o.photo))
    return "the photo is not valid";
  const r = o.recur;
  if (
    r &&
    (!Number.isInteger(r.every) ||
      r.every < 1 ||
      r.every > MAX_INTERVAL ||
      !["Days", "Weeks", "Months", "Years"].includes(r.unit) ||
      (r.remaining !== null && (!Number.isInteger(r.remaining) || r.remaining < 1)) ||
      !Array.isArray(r.days) ||
      r.days.some((n) => !Number.isInteger(n) || n < 0 || n > 6))
  )
    return "the repeat setting is not valid";
  return null;
}
// First problem of a dataset as { what, number, reason }, or null when the data is valid.
// The texts are keys of the translation table.
export function findDataProblem(x) {
  try {
    if (!x || typeof x !== "object" || Array.isArray(x))
      return problem("File", 0, "this is not a backup of this application");
    if (x.schema !== 1)
      return problem(
        "File",
        0,
        "this is not a backup of this application or its version is not supported",
      );
    for (const section of [
      "accounts",
      "categories",
      "ops",
      "tags",
      "scheduled",
      "budgets",
      "backups",
    ])
      if (!Array.isArray(x[section]))
        return problem("Section", section, "the section is missing or damaged");
    const st = x.settings;
    if (!st || typeof st !== "object" || !x.rates || typeof x.rates !== "object")
      return problem("Section", 0, "settings or exchange rates are missing");
    if (
      !COLOR.test(st.accent) ||
      !["light", "dark", "system"].includes(st.theme) ||
      !Array.isArray(st.stats)
    )
      return problem("Section", 0, "settings are damaged");
    if (!isSupportedLanguage(st.language))
      return problem("Section", 0, "the language is not supported");
    if (!knownRate(x, st.currency))
      return problem("Section", 0, "the main currency has no exchange rate");
    const accountIds = new Set();
    x.accounts.forEach((a, i) => {
      if (typeof a?.id !== "string" || accountIds.has(a.id))
        throw problem("Account", i + 1, "it has no unique id");
      accountIds.add(a.id);
    });
    for (const [i, a] of x.accounts.entries()) {
      const bad = (reason) => problem("Account", i + 1, reason);
      if (typeof a.name !== "string" || !a.name.trim()) return bad("the name is empty");
      if (!["Regular", "Savings", "Debt"].includes(a.type)) return bad("unknown type");
      if (!Number.isSafeInteger(a.opening)) return bad("the opening balance is not a number");
      if (!knownRate(x, a.currency)) return bad("the currency is unknown");
      if (!COLOR.test(a.color)) return bad("the color is not valid");
    }
    const categories = new Map();
    for (const [i, c] of x.categories.entries()) {
      const bad = (reason) => problem("Category", i + 1, reason);
      if (typeof c?.id !== "string" || categories.has(c.id)) return bad("it has no unique id");
      if (typeof c.name !== "string" || !c.name.trim()) return bad("the name is empty");
      if (!["income", "expense"].includes(c.type)) return bad("unknown type");
      if (!COLOR.test(c.color)) return bad("the color is not valid");
      if (!knownRate(x, c.currency)) return bad("the currency is unknown");
      categories.set(c.id, c);
    }
    for (const [i, c] of x.categories.entries()) {
      if (!c.parent) continue;
      const parent = categories.get(c.parent);
      if (!parent || parent.parent || parent.id === c.id || parent.type !== c.type)
        return problem("Category", i + 1, "the parent category is not valid");
    }
    const seen = new Set();
    for (const [list, what] of [
      [x.ops, "Operation"],
      [x.scheduled, "Scheduled payment"],
    ])
      for (const [i, o] of list.entries()) {
        const reason = operationProblem(o ?? {}, x, accountIds, categories, seen);
        if (reason) return problem(what, i + 1, reason);
        seen.add(o.id);
      }
    for (const [i, b] of x.budgets.entries()) {
      const bad = (reason) => problem("Budget", i + 1, reason);
      if (typeof b?.name !== "string") return bad("the name is empty");
      if (!Number.isSafeInteger(b.amount) || b.amount <= 0)
        return bad("the amount must be greater than zero");
      if (!knownRate(x, b.currency)) return bad("the currency is unknown");
      if (!["day", "week", "month", "year"].includes(b.period))
        return bad("the period is not valid");
      if (
        b.categories !== null &&
        (!Array.isArray(b.categories) ||
          !b.categories.length ||
          b.categories.some((id) => !categories.has(id)))
      )
        return bad("a category is not found");
    }
    return null;
  } catch (error) {
    // Checks above throw a problem when they cannot go on.
    return error?.what ? error : problem("File", 0, "this is not a backup of this application");
  }
}
// Check that an object matches the stored dataset schema (also used for imports).
export const isValidData = (x) => !findDataProblem(x);

// Persist appData to localStorage.
export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    return true;
  } catch {
    toast("DEMO: storage is unavailable or full. Export a Data file to keep changes.");
    return false;
  }
}
