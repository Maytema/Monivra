// Source-derived inventory of the first application (js/) mapped to the React Native application (mobile/src),
// for the parity matrix of the audit. It reads code only; what was exercised at run time comes from the emulator
// scripts (the labels they tap) and is marked as such, never as a verified match.
//   screens  — root tabs and full pages (js/app/shell.js PAGE_VIEWS, TAB_VIEWS, settings/info pages);
//   routes   — the places that open a page (openPage call sites);
//   overlays — the places that open a sheet, a dialog or a confirmation (openSheet, confirmAction call sites);
//   actions  — the controls built with the UI primitives (button, icon button, menu row, toggle, field, stepper,
//              tile, tabs, floating button) with a literal label, by call site; controls of every list item count
//              once (one call site), so the number is of distinct controls in the code, not on the screen.
// Usage: node tools/audit/inventory.mjs <out-dir>   → inventory.json, PARITY_MATRIX.csv, counts on stdout.
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] ?? "docs/audits/monivra-parity-performance";
const walk = (dir, ext, list = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, ext, list);
    else if (ext.test(e.name) && !f.includes("/i18n/")) list.push(f);
  }
  return list;
};
const oldFiles = walk("js", /\.js$/);
const rnFiles = walk("mobile/src", /\.tsx?$/);
const rnText = rnFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n");
const rnHas = (label) => label.length > 1 && (rnText.includes(`"${label}"`) || rnText.includes(`'${label}'`) || rnText.includes(`\`${label}\``));
const rnWhere = (label) =>
  rnFiles.filter((f) => {
    const t = fs.readFileSync(f, "utf8");
    return t.includes(`"${label}"`) || t.includes(`'${label}'`);
  }).map((f) => f.replace("mobile/src/", ""));
const tourText = ["mobile/scripts/emulator-smoke.sh", "mobile/scripts/emulator-perf.sh", "tools/audit/compare.mjs"].map((f) => fs.readFileSync(f, "utf8")).join("\n");
const tapped = new Set([...tourText.matchAll(/tap(?:_part)?\(?\s*"([^"]+)"/g)].map((m) => m[1]));

// The text of a call from its opening parenthesis to the matching one (strings and templates skipped).
function callText(code, open) {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    const c = code[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      for (i++; i < code.length && code[i] !== q; i++) if (code[i] === "\\") i++;
    } else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return code.slice(open, i + 1);
  }
  return code.slice(open);
}
// The n-th top-level argument of a call text "(a, b, …)" when it is a plain string literal.
function literalArg(text, n) {
  const args = [];
  let depth = 0;
  let start = 1;
  for (let i = 1; i < text.length - 1; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      for (i++; i < text.length && text[i] !== q; i++) if (text[i] === "\\") i++;
    } else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "," && depth === 0) args.push(text.slice(start, i)), (start = i + 1);
  }
  args.push(text.slice(start, text.length - 1));
  const a = (args[n] ?? "").trim();
  const m = a.match(/^(?:translate\w*\()?"([^"]+)"\)?$/);
  return m ? m[1] : null;
}
const lineOf = (code, index) => code.slice(0, index).split("\n").length;

// ---- Screens (pages and tabs) with their React Native counterpart --------------------------------------------
const RN_PAGES = {
  "tab:accounts": "app/(tabs)/index.tsx", "tab:categories": "app/(tabs)/categories.tsx", "tab:operations": "app/(tabs)/operations.tsx",
  "tab:statistics": "app/(tabs)/statistics.tsx", "tab:more": "app/(tabs)/more.tsx",
  accountEdit: "app/account.tsx", accountType: "features/account-editor.tsx (type step)", filtered: "app/filtered.tsx",
  categoryEdit: "app/category.tsx", categoryManage: "app/categories-manage.tsx", scheduled: "app/scheduled.tsx", budgets: "app/budgets.tsx",
  budgetDetails: "app/budget-details.tsx", budget: "app/budget.tsx", settings: "app/settings.tsx", data: "app/data.tsx",
  deletion: "features/data.tsx (deletion)", dataFile: "features/data.tsx (data file)", importData: "features/data.tsx (import)",
  export: "features/export-page.tsx", savedBackups: "features/data.tsx (backups)", restoreBackup: "features/data.tsx (restore)",
  exportPreview: "features/export-page.tsx (Preview)", importColumns: "features/import-wizard.tsx", importLinks: "features/import-wizard.tsx",
  importPreview: "features/import-wizard.tsx", importDone: "features/import-wizard.tsx", importExample: "features/import-wizard.tsx",
  notifications: "app/settings-page.tsx", security: "app/settings-page.tsx", privacy: "app/settings-page.tsx", backups: "app/settings-page.tsx",
  rates: "app/rates.tsx", profile: "app/info.tsx", subscription: "app/info.tsx", shared: "app/info.tsx", instructions: "app/info.tsx",
  support: "app/info.tsx", about: "app/info.tsx", privacyPolicy: "app/info.tsx", terms: "app/info.tsx",
  elementsOperations: "app/settings-page.tsx", elementsAccounts: "app/settings-page.tsx", elementsCategories: "app/settings-page.tsx",
  elementsKeyboard: "app/settings-page.tsx", formatting: "app/settings-page.tsx", styles: "app/settings-page.tsx", stylesGlobal: "app/settings-page.tsx",
  stylesColor: "app/settings-page.tsx", stylesNavigation: "app/settings-page.tsx", stylesElements: "app/settings-page.tsx", stylesLanguage: "app/settings-page.tsx",
  "special:welcome": "features/welcome.tsx", "special:recovery": "features/recovery.tsx", "special:lock": "features/lock.tsx",
};
const screens = Object.entries(RN_PAGES).map(([kind, rn], i) => ({
  id: `SC-${String(i + 1).padStart(3, "0")}`,
  kind,
  rn,
  rnExists: fs.existsSync(path.join("mobile/src", rn.split(" ")[0])),
}));

// ---- Routes, overlays, actions ------------------------------------------------------------------------------
const PRIMITIVES = { buttonHtml: 0, iconButtonHtml: 1, menuRowHtml: 0, toggleRowHtml: 0, fieldButtonHtml: 0, stepperHtml: 0, textFieldHtml: 0, numberFieldHtml: 0, searchFieldHtml: 0, actionTileHtml: 1, fabHtml: 0 };
const routes = [];
const overlays = [];
const actions = [];
for (const file of oldFiles) {
  const code = fs.readFileSync(file, "utf8");
  for (const m of code.matchAll(/\b(openPage|openSheet|confirmAction)\(/g)) {
    if (file.endsWith("ui/navigation.js") && m[1] !== "confirmAction") continue; // the definitions
    const text = callText(code, m.index + m[0].length - 1);
    const where = `${file}:${lineOf(code, m.index)}`;
    if (m[1] === "openPage") routes.push({ target: literalArg(text, 0) ?? "(computed)", where });
    else {
      const titles = [...text.matchAll(/,\s*"([A-Z][^"]+)"\s*,\s*"(?:dialog|sheet|menu)"/g)].map((x) => x[1]);
      const label = m[1] === "openSheet" ? titles.pop() ?? [...text.matchAll(/"([A-Z][^"]{3,60})"/g)].map((x) => x[1]).pop() ?? "(computed)" : literalArg(text, 0) ?? "(computed)";
      overlays.push({ kind: m[1], label, where });
    }
  }
  for (const [fn, arg] of Object.entries(PRIMITIVES))
    for (const m of code.matchAll(new RegExp(`\\b${fn}\\(`, "g"))) {
      if (file.endsWith("ui/primitives.js") || file.endsWith("ui/number-picker.js") && fn === "numberFieldHtml" && code.slice(m.index - 20, m.index).includes("const")) continue;
      const text = callText(code, m.index + m[0].length - 1);
      actions.push({ control: fn.replace("Html", ""), label: literalArg(text, arg) ?? "(computed)", where: `${file}:${lineOf(code, m.index)}` });
    }
  for (const m of code.matchAll(/data-action="\$\{registerAction\(/g)) actions.push({ control: "custom", label: "(custom markup)", where: `${file}:${lineOf(code, m.index)}` });
}
// Labels that are not in the React Native source, checked by a person: what is there instead.
const DECISIONS = {
  "Subcategory actions": "INTENTIONAL DIFFERENCE: the menu has the subcategory's name as its heading (features/category-editor.tsx)",
  PIN: "INTENTIONAL DIFFERENCE: one sheet 'Set PIN' / 'Turn off PIN' (features/lock.tsx PinSetup), verified on the RN emulator (15q)",
  "Delete selected operations?": "INTENTIONAL DIFFERENCE: longer text that names the consequences, and a backup first (features/operations.tsx)",
  Menu: "SOURCE-MAPPED: generic menu sheet (ui/dialogs.tsx menu)",
  "The file is ready. The browser asks for one more tap to open the share sheet.": "INTENTIONAL DIFFERENCE: browser only; the native share sheet opens directly",
  "List customization": "INTENTIONAL DIFFERENCE: titled 'Icon list customization' / 'Colors list customization' (ui/customize-sheet.tsx)",
  "Test notification": "VISUAL/TEXT DIFFERENCE: called 'Run notification' (features/settings.tsx:202); behaviour the same",
  "Click on the value to edit": "INTENTIONAL DIFFERENCE: 'Tap the value to edit' (touch wording)",
  "0": "SOURCE-MAPPED: digit key of ui/number-sheet.tsx DigitPad (label built in code)",
  ".": "SOURCE-MAPPED: decimal key of ui/number-sheet.tsx DigitPad",
};
const status = (label) => DECISIONS[label] ?? (label.startsWith("(") ? "UNTESTED (label computed: needs a person)" : rnHas(label) ? (tapped.has(label) ? "RUNTIME-EXERCISED in RN (emulator), not compared" : "SOURCE-MAPPED, UNTESTED") : "NOT FOUND IN RN SOURCE (review: missing or reworded)");
const number = (prefix, list) => list.map((x, i) => ({ id: `${prefix}-${String(i + 1).padStart(4, "0")}`, ...x, rnLabel: !x.label?.startsWith("(") && rnHas(x.label ?? ""), rnWhere: x.label && !x.label.startsWith("(") ? rnWhere(x.label).slice(0, 3).join(" ") : "", status: status(x.label ?? x.target ?? "(computed)") }));
// A route is mapped when the page it opens has a counterpart (the page key itself is code, not text).
const R = number("RT", routes.map((r) => ({ ...r, label: r.target }))).map((r) =>
  RN_PAGES[r.label] ? { ...r, rnLabel: true, rnWhere: RN_PAGES[r.label], status: tapped.size && r.status.startsWith("RUNTIME") ? r.status : "SOURCE-MAPPED (target screen exists), UNTESTED" } : r,
);
const O = number("OV", overlays);
const A = number("AC", actions);
const all = { generatedFrom: "js/ (first application) and mobile/src (React Native)", screens, routes: R, overlays: O, actions: A };
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "inventory.json"), JSON.stringify(all, null, 1));
const csv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const rows = [["id", "type", "control/kind", "label/target", "original location", "RN location (label found in)", "status"]];
for (const s of screens) rows.push([s.id, "screen", s.kind, "", "js/app/shell.js", s.rn + (s.rnExists ? "" : " (file not found)"), s.rnExists ? "SOURCE-MAPPED (screen exists), states UNTESTED" : "REVIEW"]);
for (const r of R) rows.push([r.id, "route", "openPage", r.label, r.where, r.rnWhere, r.status]);
for (const o of O) rows.push([o.id, "overlay", o.kind, o.label, o.where, o.rnWhere, o.status]);
for (const a of A) rows.push([a.id, "action", a.control, a.label, a.where, a.rnWhere, a.status]);
fs.writeFileSync(path.join(outDir, "PARITY_MATRIX.csv"), rows.map((r) => r.map(csv).join(",")).join("\n") + "\n");
const count = (list, f) => list.filter(f).length;
const summary = (name, list) =>
  `${name}: ${list.length} (mapped by label or target ${count(list, (x) => x.rnLabel)}, exercised on the RN emulator ${count(list, (x) => x.status.startsWith("RUNTIME"))}, intentional difference ${count(list, (x) => x.status.startsWith("INTENTIONAL"))}, text difference ${count(list, (x) => x.status.startsWith("VISUAL"))}, not found in RN ${count(list, (x) => x.status.startsWith("NOT FOUND"))}, label computed in code ${count(list, (x) => x.status.includes("computed"))})`;
console.log(`screens: ${screens.length} (RN file exists ${count(screens, (s) => s.rnExists)})`);
console.log(summary("routes", R));
console.log(summary("overlays", O));
console.log(summary("actions", A));

// ---- The navigation graph: which file opens which page, and the windows each file opens ----------------------
const byFile = new Map();
const add = (file, line) => byFile.set(file, [...(byFile.get(file) ?? []), line]);
for (const r of R) add(r.where.split(":")[0], `→ page **${r.label}** (${r.id}, line ${r.where.split(":")[1]}) — RN: ${r.rnWhere || "?"}`);
for (const o of O) add(o.where.split(":")[0], `◇ ${o.kind === "confirmAction" ? "confirmation" : "window"} "${o.label}" (${o.id}, line ${o.where.split(":")[1]})`);
const graph = [
  "# Navigation graph of the first application (generated)",
  "",
  "Generated by `node tools/audit/inventory.mjs` from the code of `js/`. Root: the five tabs (Accounts, Categories, Operations, Statistics, More) of `js/app/shell.js` (TAB_VIEWS); full pages come from PAGE_VIEWS, the settings tree and the info pages. Below, every file that opens a page (→) or a window (◇), with the stable IDs of PARITY_MATRIX.csv. Gestures that open things without a call written here (swipes between periods, long press on an operation, drag to reorder) are listed in FUNCTIONAL_GAPS.md under the states and gestures.",
  "",
];
for (const [file, lines] of [...byFile].sort()) graph.push(`## ${file}`, "", ...lines.map((l) => `- ${l}`), "");
fs.writeFileSync(path.join(outDir, "NAVIGATION_GRAPH.md"), graph.join("\n"));
