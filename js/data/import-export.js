/* Import and export (JSON, CSV) */
import { render } from "../app/shell.js";
import { deepClone, escapeHtml, newId } from "../core/constants.js";
import { appData, importKind, setAppData, setImportKind, uiState } from "../core/state.js";
import { isTestMode } from "../core/test-mode.js";
import { createEmptyData } from "./seed.js";
import { isValidData, save } from "./storage.js";
import {
  accountById,
  categoryById,
  dataSnapshot,
  formatMoney,
  periodTitle,
  totalByType,
  visibleOperations,
} from "../domain/finance.js";
import { validateOp } from "../domain/operations.js";
import { opTitle } from "../screens/operation-editor.js";
import {
  closeLayers,
  confirmAction,
  goHome,
  openPage,
  openSheet,
  pageHeader,
  promptText,
} from "../ui/kit.js";
import { menuRowHtml, toast } from "../ui/primitives.js";

// Trigger a file download from text content.
export function download(name, content, type) {
  if (isTestMode()) {
    window.__download = { name, content, type };
    toast("File prepared");
    return;
  }
  const blob = new Blob([content], { type }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast("File prepared");
}
// Export the whole dataset as a JSON backup.
export function exportJSON() {
  download("monivra-data.json", JSON.stringify(dataSnapshot(), null, 2), "application/json");
}
// Build CSV text of the visible operations.
export function csvText() {
  const q = (s) => '"' + String(s ?? "").replace(/"/g, '""') + '"';
  return [
    "type,date,amount,currency,from,to,category,comment,tags",
    ...appData.ops.map((o) =>
      [
        o.type,
        o.date,
        (o.amount / 100).toFixed(2),
        accountById(o.from || o.to)?.currency,
        accountById(o.from)?.name,
        accountById(o.to)?.name,
        categoryById(o.category)?.name,
        o.comment,
        (o.tags || []).join("|"),
      ]
        .map(q)
        .join(","),
    ),
  ].join("\r\n");
}
// Parse CSV text into rows.
export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "");
  let rows = [],
    row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    let c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw Error("Unclosed CSV quote");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  if (!rows.length) throw Error("CSV is empty");
  const headers = rows.shift();
  if (
    !["type", "date", "amount", "currency", "from", "to", "category"].every((x) =>
      headers.includes(x),
    )
  )
    throw Error("Use the demo CSV header format");
  return rows.map((values) => Object.fromEntries(headers.map((h, i) => [h, values[i] || ""])));
}
// Turn parsed CSV rows into validated operations.
export function prepareCSV(text) {
  const rows = parseCSV(text),
    out = [];
  for (const [i, r] of rows.entries()) {
    const findAccount = (name) => {
      const candidates = appData.accounts.filter(
        (a) => a.name === name && a.currency === r.currency,
      );
      if (candidates.length !== 1)
        throw Error("CSV row " + (i + 2) + ": account name/currency missing or ambiguous");
      return candidates[0].id;
    };
    if (!/^\d+(\.\d{1,2})?$/.test(r.amount)) throw Error("CSV row " + (i + 2) + ": invalid amount");
    const o = {
      id: newId(),
      type: r.type,
      date: r.date,
      amount: Math.round(Number(r.amount) * 100),
      comment: r.comment,
      tags: r.tags ? r.tags.split("|") : [],
    };
    if (r.type !== "income") o.from = findAccount(r.from);
    if (r.type !== "expense") o.to = findAccount(r.to);
    if (r.type !== "transfer") {
      const c = appData.categories.filter((c) => c.name === r.category && c.type === r.type);
      if (c.length !== 1) throw Error("CSV row " + (i + 2) + ": category missing or ambiguous");
      o.category = c[0].id;
    }
    if (!["income", "expense", "transfer"].includes(o.type))
      throw Error("CSV row " + (i + 2) + ": invalid type");
    validateOp(o);
    out.push(o);
  }
  return out;
}
// Open the file chooser for JSON/CSV import.
function importFile(kind) {
  setImportKind(kind);
  if (isTestMode()) return toast("File picker requested");
  const e = document.getElementById("import-file");
  e.accept = kind === "csv" ? ".csv" : ".json";
  e.value = "";
  e.click();
}
// Data page: backups, data file export/import and reset.
export function dataView() {
  return (
    pageHeader("Data") +
    `<div class="content flush mon-data-menu">${menuRowHtml("Saved backups", "archive", () => openPage("backups"))}${menuRowHtml(
      "Data file",
      "receipt",
      () =>
        openSheet(
          () =>
            `<h2>Data file</h2><p>Save a local copy of your Monivra beta data or restore a previously exported JSON file.</p>${menuRowHtml(
              "Save data file",
              "download",
              () => {
                closeLayers();
                exportJSON();
              },
            )}${menuRowHtml("Restore data file", "upload", () => {
              closeLayers();
              importFile("json");
            })}`,
          "Data file",
        ),
    )}${menuRowHtml("Import data", "upload", () =>
      openSheet(
        () =>
          `<h2>Import data</h2><p>Importing data may change your existing records. Export a backup first.</p>${menuRowHtml(
            "Import Monivra JSON",
            "upload",
            () => {
              closeLayers();
              importFile("json");
            },
          )}${menuRowHtml("Import operations CSV", "upload", () => {
            closeLayers();
            importFile("csv");
          })}`,
        "Import data",
      ),
    )}${menuRowHtml("Export data", "download", () =>
      openSheet(
        () =>
          `<h2>Export data</h2><p>Export a local file from this closed beta.</p>${menuRowHtml(
            "Complete data file (JSON)",
            "download",
            () => {
              closeLayers();
              exportJSON();
            },
          )}${menuRowHtml("Operations (CSV)", "download", () => {
            closeLayers();
            download("monivra-operations.csv", csvText(), "text/csv;charset=utf-8");
          })}${menuRowHtml("Report (PDF)", "receipt", () => {
            closeLayers();
            printReport();
          })}`,
        "Export data",
      ),
    )}${menuRowHtml("Delete my data", "trash", () => {
      promptText("Type DELETE to erase all financial data", "", (v) => {
        if (v.trim() !== "DELETE") {
          toast("Deletion cancelled: type DELETE exactly");
          return;
        }
        confirmAction(
          "Permanently delete all accounts, categories, transactions, schedules and budgets?",
          () => {
            setAppData(createEmptyData());
            save();
            goHome("accounts");
          },
          true,
          "Delete",
        );
      });
    })}<p class="footnote">All exports and imports are handled on this device. This beta does not provide cloud backup or account synchronization.</p></div>`
  );
}
// Open the printable report.
function printReport() {
  const out = `<h1>Monivra · Demo report</h1><p>${escapeHtml(periodTitle())}</p><p>Income: ${formatMoney(totalByType("income"))} · Expense: ${formatMoney(totalByType("expense"))}</p><table><thead><tr><th>Date</th><th>Type / category</th><th>Account</th><th>Amount</th></tr></thead><tbody>${visibleOperations()
    .map(
      (o) =>
        `<tr><td>${escapeHtml(o.date)}</td><td>${escapeHtml(opTitle(o))}</td><td>${escapeHtml(accountById(o.from || o.to)?.name)}</td><td>${formatMoney(o.amount, accountById(o.from || o.to)?.currency)}</td></tr>`,
    )
    .join("")}</tbody></table>`;
  if (isTestMode()) {
    window.__print = out;
    return;
  }
  document.getElementById("printout").innerHTML = out;
  window.print();
}
// Apply a selected import file after confirmation.
export function handleImport(text) {
  if (importKind === "csv") {
    const ops = prepareCSV(text);
    confirmAction(
      "Append " + ops.length + " operations from this CSV?",
      () => {
        appData.ops.push(...ops);
        for (const o of ops)
          for (const tag of o.tags) if (!appData.tags.includes(tag)) appData.tags.push(tag);
        save();
        toast("CSV imported");
        render();
      },
      true,
      "Apply",
    );
  } else {
    const data = JSON.parse(text);
    if (!isValidData(data))
      throw Error(
        "The selected JSON does not match the Monivra backup format. Check the file and try again.",
      );
    confirmAction(
      "Replace existing accounts, categories and operations with " +
        data.accounts.length +
        " accounts, " +
        data.categories.length +
        " categories and " +
        data.ops.length +
        " operations from this file?",
      () => {
        const backups = deepClone(appData.backups);
        setAppData(deepClone(data));
        appData.backups = backups;
        uiState.filters = {
          accounts: null,
          categories: null,
          types: null,
          tags: null,
          comment: "",
        };
        save();
        goHome("more");
        toast("Data imported");
      },
      true,
      "Apply",
    );
  }
}
