/* Data validation and persistence */
import { STORAGE_KEY } from "../core/constants.js";
import { appData } from "../core/state.js";
import { toast } from "../ui/primitives.js";

// Check that an object matches the stored dataset schema (also used for imports).
export function isValidData(x) {
  try {
    if (
      !x ||
      x.schema !== 1 ||
      !Array.isArray(x.accounts) ||
      !Array.isArray(x.ops) ||
      !Array.isArray(x.categories) ||
      !x.settings ||
      !x.rates ||
      !Array.isArray(x.tags) ||
      !Array.isArray(x.scheduled) ||
      !Array.isArray(x.budgets) ||
      !Array.isArray(x.backups)
    )
      return false;
    const st = x.settings;
    if (
      !/^#[a-f0-9]{6}$/i.test(st.accent) ||
      !["en", "ru"].includes(st.language) ||
      !["light", "dark", "system"].includes(st.theme) ||
      !Array.isArray(st.stats) ||
      !Number.isFinite(x.rates[st.currency]) ||
      x.rates[st.currency] <= 0
    )
      return false;
    const ids = new Set();
    for (const a of x.accounts) {
      if (
        typeof a.id !== "string" ||
        ids.has(a.id) ||
        typeof a.name !== "string" ||
        !Number.isSafeInteger(a.opening) ||
        !["Regular", "Savings", "Debt"].includes(a.type) ||
        !Number.isFinite(x.rates[a.currency]) ||
        x.rates[a.currency] <= 0 ||
        !/^#[a-f0-9]{6}$/i.test(a.color)
      )
        return false;
      ids.add(a.id);
    }
    const cids = new Set(x.categories.map((c) => c.id));
    if (cids.size !== x.categories.length) return false;
    for (const c of x.categories) {
      if (
        typeof c.id !== "string" ||
        typeof c.name !== "string" ||
        !["income", "expense"].includes(c.type) ||
        !/^#[a-f0-9]{6}$/i.test(c.color) ||
        !Number.isFinite(x.rates[c.currency]) ||
        x.rates[c.currency] <= 0
      )
        return false;
      if (c.parent) {
        const parent = x.categories.find((a) => a.id === c.parent);
        if (!parent || parent.parent || parent.id === c.id || parent.type !== c.type) return false;
      }
    }
    const oids = new Set();
    for (const o of [...x.ops, ...x.scheduled]) {
      if (
        typeof o.id !== "string" ||
        oids.has(o.id) ||
        !Number.isSafeInteger(o.amount) ||
        o.amount <= 0 ||
        !["income", "expense", "transfer", "adjustment"].includes(o.type) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(o.date) ||
        new Date(o.date + "T12:00:00Z").toISOString().slice(0, 10) !== o.date ||
        !Array.isArray(o.tags) ||
        o.tags.some((t) => typeof t !== "string") ||
        typeof o.comment !== "string"
      )
        return false;
      oids.add(o.id);
      if (o.type === "adjustment") {
        if (!ids.has(o.from || o.to) || !!o.from === !!o.to) return false;
      } else if (o.type === "transfer") {
        if (
          !ids.has(o.from) ||
          !ids.has(o.to) ||
          o.from === o.to ||
          !Number.isSafeInteger(o.receive) ||
          o.receive <= 0
        )
          return false;
      } else {
        if (
          (o.type === "expense" && o.to) ||
          (o.type === "income" && o.from) ||
          !ids.has(o.type === "expense" ? o.from : o.to) ||
          !cids.has(o.category) ||
          x.categories.find((c) => c.id === o.category).type !== o.type
        )
          return false;
      }
      if (o.photo && !/^data:image\/(jpeg|png|webp|gif);base64,[a-z0-9+/=]+$/i.test(o.photo))
        return false;
      if (
        o.recur &&
        (!Number.isInteger(o.recur.every) ||
          o.recur.every < 1 ||
          o.recur.every > 365 ||
          !["Days", "Weeks", "Months", "Years"].includes(o.recur.unit) ||
          (o.recur.remaining !== null &&
            (!Number.isInteger(o.recur.remaining) || o.recur.remaining < 1)) ||
          !Array.isArray(o.recur.days) ||
          o.recur.days.some((n) => !Number.isInteger(n) || n < 0 || n > 6))
      )
        return false;
    }
    for (const b of x.budgets)
      if (
        typeof b.name !== "string" ||
        !Number.isSafeInteger(b.amount) ||
        b.amount <= 0 ||
        !Number.isFinite(x.rates[b.currency]) ||
        !["day", "week", "month", "year"].includes(b.period) ||
        (b.categories !== null &&
          (!Array.isArray(b.categories) ||
            !b.categories.length ||
            b.categories.some((id) => !cids.has(id))))
      )
        return false;
    return true;
  } catch {
    return false;
  }
}

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
