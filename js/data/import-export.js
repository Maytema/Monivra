/* Import and export (JSON, CSV) */
import { render } from "../app/shell.js";
import { clone, esc, uid } from "../core/constants.js";
import { D, U, setD } from "../core/state.js";
import { emptyData } from "./seed.js";
import { save, validData } from "./storage.js";
import {
  acc,
  cat,
  money,
  periodTitle,
  snapshot,
  totalType,
  visibleOps,
} from "../domain/finance.js";
import { validateOp } from "../domain/operations.js";
import { opTitle } from "../screens/operation-editor.js";
import { close, confirmAction, header, home, info, page, promptText, sheet } from "../ui/kit.js";
import { importKind, row, setImportKind, toast } from "../ui/primitives.js";

export function download(name, content, type) {
  if (window.__MONIVRA_TEST__) {
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
export function exportJSON() {
  download("monivra-data.json", JSON.stringify(snapshot(), null, 2), "application/json");
}
export function csvText() {
  const q = (s) => '"' + String(s ?? "").replace(/"/g, '""') + '"';
  return [
    "type,date,amount,currency,from,to,category,comment,tags",
    ...D.ops.map((o) =>
      [
        o.type,
        o.date,
        (o.amount / 100).toFixed(2),
        acc(o.from || o.to)?.currency,
        acc(o.from)?.name,
        acc(o.to)?.name,
        cat(o.category)?.name,
        o.comment,
        (o.tags || []).join("|"),
      ]
        .map(q)
        .join(","),
    ),
  ].join("\r\n");
}
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
export function prepareCSV(text) {
  const rows = parseCSV(text),
    out = [];
  for (const [i, r] of rows.entries()) {
    const findAccount = (name) => {
      const candidates = D.accounts.filter((a) => a.name === name && a.currency === r.currency);
      if (candidates.length !== 1)
        throw Error("CSV row " + (i + 2) + ": account name/currency missing or ambiguous");
      return candidates[0].id;
    };
    if (!/^\d+(\.\d{1,2})?$/.test(r.amount)) throw Error("CSV row " + (i + 2) + ": invalid amount");
    const o = {
      id: uid(),
      type: r.type,
      date: r.date,
      amount: Math.round(Number(r.amount) * 100),
      comment: r.comment,
      tags: r.tags ? r.tags.split("|") : [],
    };
    if (r.type !== "income") o.from = findAccount(r.from);
    if (r.type !== "expense") o.to = findAccount(r.to);
    if (r.type !== "transfer") {
      const c = D.categories.filter((c) => c.name === r.category && c.type === r.type);
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
function importFile(kind) {
  setImportKind(kind);
  if (window.__MONIVRA_TEST__) return toast("File picker requested");
  const e = document.getElementById("import-file");
  e.accept = kind === "csv" ? ".csv" : ".json";
  e.value = "";
  e.click();
}
export function dataView() {
  return (
    header("Data") +
    `<div class="content flush moni-data-menu">${row("Saved backups", "archive", () => page("backups"))}${row(
      "Data file",
      "receipt",
      () =>
        sheet(
          () =>
            `<h2>Data file</h2><p>Save a local copy of your Monivra beta data or restore a previously exported JSON file.</p>${row(
              "Save data file",
              "download",
              () => {
                close();
                exportJSON();
              },
            )}${row("Restore data file", "upload", () => {
              close();
              importFile("json");
            })}`,
          "Data file",
        ),
    )}${row("Import data", "upload", () =>
      sheet(
        () =>
          `<h2>Import data</h2><p>Importing data may change your existing records. Export a backup first.</p>${row(
            "Import Monivra JSON",
            "upload",
            () => {
              close();
              importFile("json");
            },
          )}${row("Import operations CSV", "upload", () => {
            close();
            importFile("csv");
          })}`,
        "Import data",
      ),
    )}${row("Export data", "download", () =>
      sheet(
        () =>
          `<h2>Export data</h2><p>Export a local file from this closed beta.</p>${row(
            "Complete data file (JSON)",
            "download",
            () => {
              close();
              exportJSON();
            },
          )}${row("Operations (CSV)", "download", () => {
            close();
            download("monivra-operations.csv", csvText(), "text/csv;charset=utf-8");
          })}${row("Report (PDF)", "receipt", () => {
            close();
            printReport();
          })}`,
        "Export data",
      ),
    )}${row("Delete my data", "trash", () => {
      promptText("Type DELETE to erase all financial data", "", (v) => {
        if (v.trim() !== "DELETE") {
          toast("Deletion cancelled: type DELETE exactly");
          return;
        }
        confirmAction(
          "Permanently delete all accounts, categories, transactions, schedules and budgets?",
          () => {
            setD(emptyData());
            save();
            home("accounts");
          },
          true,
          "Delete",
        );
      });
    })}<p class="footnote">All exports and imports are handled on this device. This beta does not provide cloud backup or account synchronization.</p></div>`
  );
}
function printReport() {
  const out = `<h1>Monivra · Demo report</h1><p>${esc(periodTitle())}</p><p>Income: ${money(totalType("income"))} · Expense: ${money(totalType("expense"))}</p><table><thead><tr><th>Date</th><th>Type / category</th><th>Account</th><th>Amount</th></tr></thead><tbody>${visibleOps()
    .map(
      (o) =>
        `<tr><td>${esc(o.date)}</td><td>${esc(opTitle(o))}</td><td>${esc(acc(o.from || o.to)?.name)}</td><td>${money(o.amount, acc(o.from || o.to)?.currency)}</td></tr>`,
    )
    .join("")}</tbody></table>`;
  if (window.__MONIVRA_TEST__) {
    window.__print = out;
    return;
  }
  document.getElementById("printout").innerHTML = out;
  window.print();
}
function copyText(text) {
  if (window.__MONIVRA_TEST__) return toast("Copied");
  if (navigator.clipboard?.writeText)
    navigator.clipboard
      .writeText(text)
      .then(() => toast("Copied"))
      .catch(() => info(text, "Diagnostic report"));
  else info(text, "Diagnostic report");
}
export function handleImport(text) {
  if (importKind === "csv") {
    const ops = prepareCSV(text);
    confirmAction(
      "Append " + ops.length + " operations from this CSV?",
      () => {
        D.ops.push(...ops);
        for (const o of ops) for (const tag of o.tags) if (!D.tags.includes(tag)) D.tags.push(tag);
        save();
        toast("CSV imported");
        render();
      },
      true,
      "Apply",
    );
  } else {
    const data = JSON.parse(text);
    if (!validData(data))
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
        const backups = clone(D.backups);
        setD(clone(data));
        D.backups = backups;
        U.filters = {
          accounts: null,
          categories: null,
          types: null,
          tags: null,
          comment: "",
        };
        save();
        home("more");
        toast("Data imported");
      },
      true,
      "Apply",
    );
  }
}
