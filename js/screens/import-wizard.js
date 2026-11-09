/* The import of operations from a CSV file as a few pages: match the columns, link the accounts and
   categories, look at what would be added, and add it. Nothing in the data changes before the last
   button; every page can go back. The logic is in data/csv-import.js. */
import { render } from "../app/shell.js";
import { APP_ID, escapeHtml, iconSvg } from "../core/constants.js";
import { appData, uiState } from "../core/state.js";
import { csvExample, csvExampleRows, csvLines, csvTemplate } from "../data/csv.js";
import {
  applyImport,
  categoryPath,
  DATE_EXAMPLES,
  DATE_ORDERS,
  DECIMALS,
  dictionary,
  FIELDS,
  guessColumns,
  guessFormats,
  guessLinks,
  planImport,
  readRecords,
  readTable,
  referencesOf,
  undoImport,
} from "../data/csv-import.js";
import { MAX_FILE_BYTES } from "../data/backup-file.js";
import { formatAmountText } from "../domain/finance.js";
import { translate, translateCount, translateWith } from "../i18n/index.js";
import { makeFile, pickFile } from "../platform/files.js";
import { confirmAction, optionSheet, showInfo } from "../ui/dialogs.js";
import { saveDelivery } from "../ui/file-actions.js";
import { closeLayers, goHome, openPage, openSheet } from "../ui/navigation.js";
import { buttonHtml, pageHeader, toast } from "../ui/primitives.js";

const WIZARD_PAGES = ["importColumns", "importLinks", "importPreview"];
const ENCODINGS = [
  ["utf-8", "UTF-8"],
  ["windows-1251", "Windows-1251 (Cyrillic)"],
];
const ROWS_SHOWN = 8;
const PROBLEMS_SHOWN = 15;
const NAMES_SHOWN = 10;

// ---- Choosing the file ----

// The text of the bytes of a file. A mark at the start tells UTF-16; otherwise `encoding` is used.
function decode(bytes, encoding) {
  const mark = bytes.length > 1 ? `${bytes[0]},${bytes[1]}` : "";
  const label = mark === "255,254" ? "utf-16le" : mark === "254,255" ? "utf-16be" : encoding;
  return new TextDecoder(label).decode(bytes);
}

// Reads the table of the wizard from the bytes of its file and the encoding chosen.
function loadTable(w) {
  w.text = decode(w.bytes, w.encoding);
  w.table = readTable(w.text);
  w.damaged = w.text.includes("�");
  w.mapping = guessColumns(w.table.headers);
  w.formats = guessFormats(w.table, w.mapping);
  w.links = null;
}

// Lets the person choose a CSV file and opens the first page of the import with it.
export async function startImport() {
  const file = await pickFile({ accept: ".csv,.txt,text/csv,text/plain" });
  if (!file) return;
  if (file.size > MAX_FILE_BYTES)
    return showInfo("The file is larger than the 20 MB import limit.", "Import failed");
  try {
    const w = {
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      encoding: "utf-8",
    };
    loadTable(w);
    openPage("importColumns", { w });
  } catch (error) {
    showInfo(error.message, "The file cannot be used");
    console.error("Import failed:", error);
  }
}

// A list of choices made of what the file or the person's data says: shown as written, never
// translated, because a column called "Date" or an account called "Wallet" is not a phrase of the
// application. Each option is [value, text, second line].
function pickSheet(title, options, value, fn) {
  openSheet(
    () =>
      `<h2>${escapeHtml(title)}</h2>${options
        .map(([v, text, hint]) =>
          buttonHtml(
            `<span class="grow">${escapeHtml(text)}${hint ? `<small class="hint">${escapeHtml(hint)}</small>` : ""}</span><input type="radio" tabindex="-1" ${value === v ? "checked" : ""} aria-label="${escapeHtml(text)}">`,
            () => {
              closeLayers();
              fn(v);
            },
            "row",
          ),
        )
        .join("")}${buttonHtml("Cancel", () => closeLayers(), "outline")}`,
    title,
  );
}

// A row of a list of choices: what is chosen on the right, a note under the name on the left.
const rowHtml = (label, value, fn, hint = "") =>
  buttonHtml(
    `<span class="grow"><span>${translate(label)}</span>${hint ? `<small>${translate(hint)}</small>` : ""}</span><span class="import-value">${value}</span><span class="chevron">${iconSvg("right", 20)}</span>`,
    fn,
    "export-row",
    `aria-label="${escapeHtml(translate(label))}"`,
  );

// ---- Page 1: the columns ----

const DELIMITER_NAMES = { ",": "comma", ";": "semicolon", "\t": "tab" };
const isReady = (w) =>
  w.mapping.date >= 0 &&
  w.mapping.amount >= 0 &&
  [w.mapping.from, w.mapping.to, w.mapping.account].some((i) => i >= 0);

// The first value of a column, for showing what the column holds.
const sampleOf = (w, index) =>
  index < 0 ? "" : (w.table.rows.find((r) => r.cells[index])?.cells[index] ?? "");

// The records of the first rows as a small table, so a wrong choice shows at once.
function samplesHtml(w) {
  const records = readRecords({ ...w.table, rows: w.table.rows.slice(0, 5) }, w.mapping, w.formats);
  const head = ["Line", "Date", "Type", "Amount", "Account", "Category"];
  const body = records
    .map((r) => {
      const account = [r.from, r.to].filter(Boolean).join(" → ");
      const amount = r.minor ? `${(r.minor / 100).toFixed(2)} ${r.currency}`.trim() : "";
      const cells = r.problem
        ? [String(r.line), `<span class="problem">${escapeHtml(translate(r.problem))}</span>`]
        : [String(r.line), r.date, r.type, amount, account, r.category].map((x) =>
            escapeHtml(x ?? ""),
          );
      return `<tr>${cells.map((c, i) => `<td${r.problem && i === 1 ? ` colspan="5"` : ""}>${c}</td>`).join("")}</tr>`;
    })
    .join("");
  return `<div class="csv-preview"><table><thead><tr>${head.map((h) => `<th>${translate(h)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
}

// Opens the list of columns of the file for one field.
function chooseColumn(w, [key, , label]) {
  const options = [
    ["-1", translate("Not used")],
    ...w.table.headers.map((h, i) => [
      String(i),
      h || translateWith("Column {n}", { n: i + 1 }),
      sampleOf(w, i).slice(0, 40),
    ]),
  ];
  pickSheet(translate(label), options, String(w.mapping[key]), (v) => {
    w.mapping[key] = Number(v);
    w.formats = guessFormats(w.table, w.mapping);
    render();
  });
}

const columnRow = (w, field) => {
  const [key, required, label] = field;
  const index = w.mapping[key];
  const header =
    index < 0
      ? translate("Not used")
      : escapeHtml(w.table.headers[index] || translateWith("Column {n}", { n: index + 1 }));
  const sample = sampleOf(w, index);
  return rowHtml(
    label,
    header,
    () => chooseColumn(w, field),
    sample
      ? escapeHtml(sample.length > 40 ? `${sample.slice(0, 40)}…` : sample)
      : required
        ? translate("Required")
        : "",
  );
};

// Page of the columns: which column holds what, and how dates and amounts are written.
export function importColumnsView(p) {
  const { w } = p;
  const { table } = w;
  const notes = [];
  if (w.damaged)
    notes.push(
      "Some characters could not be read. If the text looks wrong, choose another file encoding below.",
    );
  if (table.ragged)
    notes.push(
      translateWith(
        "Rows with a different number of cells than the first row: {n}. Missing cells are taken as empty, extra ones are left out.",
        { n: table.ragged },
      ),
    );
  if (w.formats.ambiguous && w.mapping.date >= 0)
    notes.push(
      "The dates can be read as day and month or as month and day. Check the examples below.",
    );
  if (!table.rows.length) notes.push("The file has column names but no rows.");
  const missing = [];
  if (w.mapping.date < 0) missing.push("Date");
  if (w.mapping.amount < 0) missing.push("Amount");
  if (![w.mapping.from, w.mapping.to, w.mapping.account].some((i) => i >= 0))
    missing.push("Account");
  const facts = translateWith("{file} · {rows} · separator: {delimiter}", {
    file: w.fileName,
    rows: translateCount("{n} row", "{n} rows", table.rows.length),
    delimiter: translate(DELIMITER_NAMES[table.delimiter]),
  });
  const encoding = ENCODINGS.find(([id]) => id === w.encoding)[1];
  const next = () => {
    w.records = readRecords(w.table, w.mapping, w.formats);
    w.refs = referencesOf(w.records);
    const guessed = guessLinks(w.refs);
    // A choice made before stays when its name is still in the file.
    w.links = {
      accounts: dictionary(
        Object.keys(guessed.accounts).map((k) => [k, w.links?.accounts[k] ?? guessed.accounts[k]]),
      ),
      categories: dictionary(
        Object.keys(guessed.categories).map((k) => [
          k,
          w.links?.categories[k] ?? guessed.categories[k],
        ]),
      ),
    };
    if (w.refs.accounts.length || w.refs.categories.length) openPage("importLinks", { w });
    else toPreview(w);
  };
  return (
    pageHeader("Match columns") +
    `<div class="content import-content"><p class="preview-note">${escapeHtml(facts)}</p>${notes.map((n) => `<p class="caution">${escapeHtml(translate(n))}</p>`).join("")}<p class="import-explain">${translate("Choose which column of the file holds each part of an operation. Columns named as in the file of this application are matched already.")}</p><div class="export-rows">${FIELDS.map((f) => columnRow(w, f)).join("")}</div><h3 class="export-heading">${translate("How the file is written")}</h3><div class="export-rows">${rowHtml(
      "Date order",
      DATE_EXAMPLES[w.formats.dateOrder],
      () =>
        optionSheet(
          "Date order",
          DATE_ORDERS.map((o) => [
            o,
            DATE_EXAMPLES[o],
            translate(
              { ymd: "Year, month, day", dmy: "Day, month, year", mdy: "Month, day, year" }[o],
            ),
          ]),
          w.formats.dateOrder,
          (v) => {
            w.formats.dateOrder = v;
            render();
          },
        ),
    )}${rowHtml(
      "Decimal point",
      w.formats.decimal === "." ? "1234.56" : "1234,56",
      () =>
        optionSheet(
          "Decimal point",
          DECIMALS.map((d) => [
            d,
            d === "." ? "1234.56" : "1234,56",
            translate(d === "." ? "A point" : "A comma"),
          ]),
          w.formats.decimal,
          (v) => {
            w.formats.decimal = v;
            render();
          },
        ),
      "Used when a number such as 1,234 could be read both ways",
    )}${rowHtml("File encoding", encoding, () =>
      optionSheet("File encoding", ENCODINGS, w.encoding, (v) => {
        w.encoding = v;
        try {
          loadTable(w);
        } catch (error) {
          showInfo(error.message, "The file cannot be used");
        }
        render();
      }),
    )}</div><h3 class="export-heading">${translate("How the first rows are read")}</h3><p class="preview-note">${translate("Your file · the first rows as they will be understood")}</p>${samplesHtml(w)}</div><div class="page-footer">${
      missing.length
        ? `<p class="footer-note">${escapeHtml(translateWith("Choose the columns for: {fields}", { fields: missing.map((m) => translate(m)).join(", ") }))}</p>`
        : ""
    }${buttonHtml("Next", next, "primary", isReady(w) && table.rows.length ? "" : "disabled")}</div>`
  );
}

// ---- Page 2: accounts and categories ----

const accountOptions = () => [
  ["new", translate("Create a new account")],
  ...appData.accounts.filter((a) => !a.archived).map((a) => [a.id, a.name, a.currency]),
];
const categoryOptions = (type) => [
  ["new", translate("Create a new category")],
  ...appData.categories
    .filter((c) => c.type === type && !c.archived)
    .map((c) => [c.id, categoryPath(c)]),
];
const linkText = (id, find) => {
  if (id === "new") return translate("Create new");
  const item = find(id);
  return item
    ? escapeHtml(item.currency ? `${item.name} · ${item.currency}` : categoryPath(item))
    : translate("Create new");
};

// Page of the links: for every name in the file, the account or category it stands for.
export function importLinksView(p) {
  const { w } = p;
  const made =
    Object.values(w.links.accounts).filter((v) => v === "new").length +
    Object.values(w.links.categories).filter((v) => v === "new").length;
  const rowsOf = (n) => translateCount("{n} row", "{n} rows", n);
  const accountRows = w.refs.accounts
    .map((ref) =>
      rowHtml(
        escapeHtml(ref.name),
        linkText(w.links.accounts[ref.name], (id) => appData.accounts.find((a) => a.id === id)),
        () =>
          pickSheet(ref.name, accountOptions(), w.links.accounts[ref.name], (v) => {
            w.links.accounts[ref.name] = v;
            render();
          }),
        escapeHtml([rowsOf(ref.rows), [...ref.currencies].join(", ")].filter(Boolean).join(" · ")),
      ),
    )
    .join("");
  const categoryRows = w.refs.categories
    .map((ref) =>
      rowHtml(
        escapeHtml(ref.name),
        linkText(w.links.categories[ref.key], (id) => appData.categories.find((c) => c.id === id)),
        () =>
          pickSheet(ref.name, categoryOptions(ref.type), w.links.categories[ref.key], (v) => {
            w.links.categories[ref.key] = v;
            render();
          }),
        escapeHtml(
          `${translate(ref.type === "income" ? "Income" : "Expense")} · ${rowsOf(ref.rows)}`,
        ),
      ),
    )
    .join("");
  return (
    pageHeader("Accounts and categories") +
    `<div class="content import-content"><p class="import-explain">${translate("Choose the account or category of yours that each name in the file stands for. What is not found is created when you import.")}</p><p class="preview-note">${escapeHtml(translateWith("To be created: {n}", { n: made }))}</p>${
      accountRows
        ? `<h3 class="export-heading">${translate("Accounts")}</h3><div class="export-rows">${accountRows}</div>`
        : ""
    }${categoryRows ? `<h3 class="export-heading">${translate("Categories")}</h3><div class="export-rows">${categoryRows}</div>` : ""}</div><div class="page-footer">${buttonHtml("Preview", () => toPreview(w), "primary")}</div>`
  );
}

// ---- Page 3: the preview ----

function toPreview(w) {
  w.plan = planImport(w.records, w.links);
  openPage("importPreview", { w });
}

// The name and currency of an account of the plan, whether it exists or is to be made.
const accountOf = (plan, id) =>
  appData.accounts.find((a) => a.id === id) ?? plan.created.accounts.find((a) => a.id === id);
const categoryOf = (plan, id) =>
  appData.categories.find((c) => c.id === id) ?? plan.created.categories.find((c) => c.id === id);

// One operation of the plan as the cells of a row of the examples table.
function exampleRow(plan, op, line) {
  const from = accountOf(plan, op.from);
  const to = accountOf(plan, op.to);
  const amount =
    op.type === "transfer" && from?.currency !== to?.currency
      ? `${formatAmountText(op.amount, from?.currency)} → ${formatAmountText(op.receive, to?.currency)}`
      : formatAmountText(op.amount, (from || to)?.currency);
  const found = op.category ? categoryOf(plan, op.category) : null;
  const category = found
    ? categoryPath(found, [...appData.categories, ...plan.created.categories])
    : "";
  return [
    String(line),
    op.date,
    translate(
      { income: "Income", expense: "Expense", transfer: "Transfer", adjustment: "Adjustment" }[
        op.type
      ],
    ),
    amount,
    [from?.name, to?.name].filter(Boolean).join(" → "),
    category,
  ];
}

// The list of rows that are left out, as a file that says why.
function problemFile(w) {
  const rows = [
    ["line", "reason", ...w.table.headers],
    ...w.plan.invalid.map((x) => [String(x.line), translate(x.reason), ...x.cells]),
  ];
  return makeFile(`${APP_ID}-skipped-rows.csv`, "﻿" + csvLines(rows), "text/csv;charset=utf-8");
}

const factRow = (label, value, strong = false) =>
  `<dt>${translate(label)}</dt><dd${strong ? ' class="strong"' : ""}>${escapeHtml(String(value))}</dd>`;
const listHtml = (items, more) =>
  `<ul class="restore-changes">${items.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}${more > 0 ? `<li>${escapeHtml(translateWith("…and {n} more", { n: more }))}</li>` : ""}</ul>`;

// Page of the preview: what the import would add and what it would leave out.
export function importPreviewView(p) {
  const { w } = p;
  const { plan } = w;
  const warnings = [];
  if (plan.repeated)
    warnings.push(
      translateWith(
        "Rows that repeat another row of the file: {n}. They are added as separate operations.",
        { n: plan.repeated },
      ),
    );
  if (plan.future)
    warnings.push(
      translateWith(
        "Rows dated in the future: {n}. They are added as scheduled payments and happen on their day.",
        { n: plan.future },
      ),
    );
  if (plan.ignoredSigns)
    warnings.push(
      translateWith("Income rows with a minus sign: {n}. The sign is ignored.", {
        n: plan.ignoredSigns,
      }),
    );
  if (w.formats.ambiguous && w.mapping.date >= 0)
    warnings.push(
      translate(
        "The dates can be read as day and month or as month and day. Check the examples below.",
      ),
    );
  if (w.damaged)
    warnings.push(
      translate(
        "Some characters could not be read. If the text looks wrong, choose another file encoding below.",
      ),
    );
  const run = () =>
    confirmAction(
      translateWith(
        "Add {n} operations to your data? A backup of the current data is made first.",
        { n: plan.ops.length },
      ),
      () => {
        try {
          const added = applyImport(plan);
          // Back to the page of the import, so that going back never offers the same plan again.
          while (uiState.pages.length && WIZARD_PAGES.includes(uiState.pages.at(-1).kind))
            uiState.pages.pop();
          openPage("importDone", { added, plan });
        } catch (error) {
          showInfo(error.message, "Import failed");
        }
      },
      false,
      "Import",
    );
  const examples = plan.ops
    .slice(0, ROWS_SHOWN)
    .map((op, i) => exampleRow(plan, op, plan.lines[i]));
  const table = examples.length
    ? `<h3 class="export-heading">${translate("Operations to be added")}</h3><p class="preview-note">${escapeHtml(
        examples.length < plan.ops.length
          ? translateWith("Your file · the first {shown} of {total} operations", {
              shown: examples.length,
              total: plan.ops.length,
            })
          : translateWith("Your file · all {total} operations", { total: plan.ops.length }),
      )}</p><div class="csv-preview"><table><thead><tr>${["Line", "Date", "Type", "Amount", "Account", "Category"].map((h) => `<th>${translate(h)}</th>`).join("")}</tr></thead><tbody>${examples
        .map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
        .join("")}</tbody></table></div>`
    : "";
  const newAccounts = plan.created.accounts.map((a) => `${a.name} · ${a.currency}`);
  const newCategories = plan.created.categories.map((c) =>
    categoryPath(c, [...appData.categories, ...plan.created.categories]),
  );
  const skipped = plan.invalid.length
    ? `<h3 class="export-heading">${translate("Rows that are left out")}</h3>${listHtml(
        plan.invalid
          .slice(0, PROBLEMS_SHOWN)
          .map((x) =>
            translateWith("Line {line}: {reason}", { line: x.line, reason: translate(x.reason) }),
          ),
        plan.invalid.length - PROBLEMS_SHOWN,
      )}${buttonHtml("Save the list of these rows", () => saveDelivery(problemFile(w)), "outline")}`
    : "";
  return (
    pageHeader("Import preview") +
    `<div class="content import-content"><dl class="restore-facts">${factRow("Rows in the file", plan.total)}${factRow("To be added", plan.ops.length, true)}${factRow("Already in your data, left out", plan.duplicates)}${factRow("With problems, left out", plan.invalid.length)}${factRow("New accounts", plan.created.accounts.length)}${factRow("New categories", plan.created.categories.length)}${factRow("New tags", plan.newTags.length)}</dl>${warnings.map((x) => `<p class="caution">${escapeHtml(x)}</p>`).join("")}${
      plan.ops.length
        ? ""
        : `<p class="caution">${translate("Nothing from this file can be added.")}</p>`
    }${table}${newAccounts.length ? `<h3 class="export-heading">${translate("New accounts")}</h3>${listHtml(newAccounts.slice(0, NAMES_SHOWN), newAccounts.length - NAMES_SHOWN)}` : ""}${
      newCategories.length
        ? `<h3 class="export-heading">${translate("New categories")}</h3>${listHtml(newCategories.slice(0, NAMES_SHOWN), newCategories.length - NAMES_SHOWN)}`
        : ""
    }${skipped}</div><div class="page-footer">${buttonHtml(
      translateWith("Import {n} operations", { n: plan.ops.length }),
      run,
      "primary",
      plan.ops.length ? "" : "disabled",
    )}</div>`
  );
}

// ---- Page 4: done ----

// Page after the import: what was added, with a way to take it back.
export function importDoneView(p) {
  const { added, plan } = p;
  const undo = () =>
    confirmAction(
      translate(
        "Take back this import? The operations, accounts and categories it added are removed.",
      ),
      () => {
        undoImport(added);
        uiState.pages.pop();
        render();
        toast("Import taken back");
      },
      false,
      "Take back",
    );
  return (
    pageHeader("Import finished") +
    `<div class="content import-content"><dl class="restore-facts">${factRow("Operations added", added.ops.length, true)}${factRow("Accounts created", added.accounts.length)}${factRow("Categories created", added.categories.length)}${factRow("Left out as already there", plan.duplicates)}${factRow("Left out with problems", plan.invalid.length)}</dl><p class="import-explain">${translate("A copy of your data from before the import is kept in Saved backups.")}</p></div><div class="page-footer">${buttonHtml("Show operations", () => goHome("operations"), "primary")}${buttonHtml("Take back this import", undo, "outline")}</div>`
  );
}

// ---- The example ----

const COLUMN_HELP = [
  [
    "type",
    "Kind of operation",
    "income, expense, transfer or adjustment. Left empty, the sign of the amount decides: a minus is an expense.",
  ],
  [
    "date",
    "Day of the operation",
    "2026-03-01 (year, month, day). Other orders such as 01.03.2026 are read when you choose them while importing.",
  ],
  [
    "amount",
    "Amount, in the currency of the account",
    "12.50 · a point or a comma before the cents, at most two decimals.",
  ],
  [
    "currency",
    "Currency of the account",
    "Three letters, such as USD. Left empty, the currency of the account is used, or the main currency for a new one.",
  ],
  ["from", "Account the money leaves", "For an expense, a transfer and a decrease of the balance."],
  ["to", "Account the money goes to", "For an income, a transfer and an increase of the balance."],
  [
    "category",
    "Category",
    "Food / Lunch means the subcategory Lunch of Food. Not used for transfers and adjustments.",
  ],
  ["comment", "Note", "Any text."],
  ["tags", "Tags", "Several tags are separated by |, such as work|lunch."],
  [
    "to_amount, to_currency",
    "Amount received and its currency",
    "Only for a transfer between accounts in different currencies.",
  ],
];

// Page that shows how a file for the import is written, with a sample that is not the person's data.
export function importExampleView() {
  const [head, ...rows] = csvExampleRows();
  return (
    pageHeader("Example of a CSV file") +
    `<div class="content info-text roomy"><p>This is how a file for the import is written. Each row is one operation; the first row holds the names of the columns.</p><h3 class="export-heading">Sample rows</h3><p class="preview-note">${translate("Sample values for illustration. They are not your data.")}</p><div class="csv-preview"><table><thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows
      .map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
      .join(
        "",
      )}</tbody></table></div><h3 class="export-heading">Columns</h3><div class="column-help">${COLUMN_HELP.map(
      ([name, what, how]) =>
        `<div><h4><code>${escapeHtml(name)}</code> · ${translate(what)}</h4><p>${translate(how)}</p></div>`,
    ).join(
      "",
    )}</div><h3 class="export-heading">Good to know</h3><p>Columns may be separated by commas, semicolons or tabs. The text should be UTF-8; other encodings can be chosen while importing.</p><p>You can import a file with other column names: you choose which column is which.</p><p>Accounts and categories that are not found are created. Before anything is added you see what will happen and can link each name to an account or category you have.</p><p>A row that is already in your data (same day, amount, accounts, category and comment) is left out, so importing a file twice does not add its operations twice.</p><p>A transfer between your accounts is neither an income nor an expense.</p><p>A text that begins with = + - or @ is written with a leading apostrophe by this application so that spreadsheets do not take it for a formula. The apostrophe is removed when the file is imported.</p></div><div class="page-footer">${buttonHtml("Download example file", () => saveDelivery(makeFile(`${APP_ID}-import-example.csv`, "﻿" + csvExample(), "text/csv;charset=utf-8")), "outline")}${buttonHtml("Download empty template", () => saveDelivery(makeFile(`${APP_ID}-import-template.csv`, "﻿" + csvTemplate(), "text/csv;charset=utf-8")), "outline")}</div>`
  );
}

// Keeps the pages the import is made of together for the router.
export const IMPORT_VIEWS = {
  importColumns: importColumnsView,
  importLinks: importLinksView,
  importPreview: importPreviewView,
  importDone: importDoneView,
  importExample: importExampleView,
};
