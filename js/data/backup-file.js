/* The data file: everything in the format of this application, written and read back.
   A file chosen by the person is untrusted input: it is checked before any of it is used. */
import { APP_ID, APP_BUILD, APP_NAME, today } from "../core/constants.js";
import { dataSnapshot } from "../domain/backups.js";
import { translate } from "../i18n/index.js";
import { completeData } from "./defaults.js";
import { describeProblem } from "./problems.js";
import { findDataProblem } from "./storage.js";

export const BACKUP_TYPE = "application/json";
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
// A file bigger in records or nesting than any real one is refused rather than worked through.
const MAX_NODES = 4_000_000;
const MAX_DEPTH = 12;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
// The parts of a data file; anything else in it is not taken over.
const KNOWN_KEYS = [
  "schema",
  "accounts",
  "categories",
  "ops",
  "tags",
  "scheduled",
  "budgets",
  "backups",
  "settings",
  "rates",
];

export const backupFileName = () => `${APP_ID}-backup-${today()}.json`;

// Text of a data file with everything the person recorded, plus a small description of the file.
export const backupFileText = () =>
  JSON.stringify(
    {
      ...dataSnapshot(),
      meta: { app: APP_NAME, build: APP_BUILD, exportedAt: new Date().toISOString() },
    },
    null,
    2,
  );

// Throws when the parsed file nests too deep, is too big, or has names that could reach the
// prototypes of objects.
function checkShape(root) {
  let nodes = 0;
  const walk = (value, depth) => {
    if (value === null || typeof value !== "object") return;
    if (depth > MAX_DEPTH || ++nodes > MAX_NODES)
      throw Error(translate("The file is too large or too deeply nested to be a backup."));
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key))
        throw Error(translate("The file contains names that a backup never has."));
      walk(value[key], depth + 1);
    }
  };
  walk(root, 0);
}

// What a file says about itself: the application, its build and the day it was written.
const describeMeta = (meta) => {
  const text = (v) => (typeof v === "string" ? v.slice(0, 40) : "");
  return meta && typeof meta === "object"
    ? { app: text(meta.app), build: text(meta.build), exportedAt: text(meta.exportedAt) }
    : { app: "", build: "", exportedAt: "" };
};

// Reads the text of a data file: { data, meta } for a valid one, an Error explaining the problem
// for any other. `data` holds only the known parts and no backups.
export function parseBackupFile(text) {
  if (!text.trim()) throw Error(translate("The file is empty."));
  let parsed;
  try {
    parsed = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    throw Error(translate("The file is damaged or is not a JSON file."));
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw Error(describeProblem(findDataProblem(parsed)));
  checkShape(parsed);
  if (typeof parsed.schema === "number" && parsed.schema > 1)
    throw Error(translate("The file was made by a newer version of the application."));
  const data = Object.fromEntries(KNOWN_KEYS.filter((k) => k in parsed).map((k) => [k, parsed[k]]));
  data.backups = [];
  const problem = findDataProblem(data);
  if (problem) throw Error(describeProblem(problem));
  return { data: completeData(data), meta: describeMeta(parsed.meta) };
}

// The newest backup kept inside damaged stored text that is itself valid, or null: a way back when
// only the main data was damaged.
export function newestBackupInside(raw) {
  try {
    const parsed = JSON.parse(raw);
    const backups = Array.isArray(parsed?.backups) ? parsed.backups : [];
    const sorted = backups
      .filter((b) => typeof b?.at === "string" && b.data && typeof b.data === "object")
      .sort((a, b) => b.at.localeCompare(a.at));
    for (const backup of sorted) {
      const data = Object.fromEntries(
        KNOWN_KEYS.filter((k) => k in backup.data).map((k) => [k, backup.data[k]]),
      );
      data.backups = [];
      if (!findDataProblem(data)) return { at: backup.at, data: completeData(data) };
    }
  } catch {
    // Not readable at all: there is no backup to offer.
  }
  return null;
}
