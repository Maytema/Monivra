import { check } from "./harness.js";
import { createReportFixture } from "./report-fixture.js";
import { appData, setAppData, uiState } from "../js/core/state.js";
import { findDataProblem } from "../js/data/storage.js";
import { createBackup } from "../js/domain/backups.js";
import { DELETIONS, deleteData } from "../js/domain/deletion.js";
import { accountBalance } from "../js/domain/finance.js";

const withEverything = () => {
  const data = createReportFixture();
  data.scheduled = [
    { ...structuredClone(data.ops.find((o) => o.type === "expense")), id: "s1", recur: null },
  ];
  data.budgets = [
    {
      id: "b1",
      name: "Food",
      currency: "KGS",
      amount: 100000,
      period: "month",
      categories: ["food"],
    },
  ];
  data.tags = ["work", "долг"];
  setAppData(data);
  createBackup("manual");
  return data;
};
const counts = () =>
  ["accounts", "categories", "ops", "tags", "scheduled", "budgets", "backups"].map(
    (list) => appData[list].length,
  );

check(
  "Deleting operations leaves everything else, and the balances go back to the opening ones",
  () => {
    withEverything();
    const [accounts, categories, , tags, scheduled, budgets, backups] = counts();
    deleteData("operations");
    const after = counts();
    return (
      after.join() === [accounts, categories, 0, tags, scheduled, budgets, backups].join() &&
      appData.accounts.every((a) => accountBalance(a.id) === a.opening) &&
      !findDataProblem(appData)
    );
  },
);

check(
  "Partial deletion leaves the settings, the rates and the backups and nothing that points to the deleted",
  () => {
    const data = withEverything();
    const settings = JSON.stringify(data.settings);
    const rates = JSON.stringify(data.rates);
    const backups = appData.backups.length;
    deleteData("partial");
    return (
      counts().join() === [0, 0, 0, 0, 0, 0, backups].join() &&
      JSON.stringify(appData.settings) === settings &&
      JSON.stringify(appData.rates) === rates &&
      !findDataProblem(appData)
    );
  },
);

check("Deleting the backups leaves the data as it is", () => {
  withEverything();
  const [accounts, categories, ops, tags, scheduled, budgets] = counts();
  deleteData("backups");
  return counts().join() === [accounts, categories, ops, tags, scheduled, budgets, 0].join();
});

check("Deleting local data leaves new, valid data with the settings of a new start", () => {
  withEverything();
  appData.settings.accent = "#0b6aa8";
  deleteData("everything");
  return (
    counts().every((n) => n === 0) &&
    appData.settings.accent !== "#0b6aa8" &&
    !findDataProblem(appData)
  );
});

check("A copy made before a deletion holds the data that is deleted", () => {
  withEverything();
  const ops = appData.ops.length;
  const backups = appData.backups.length;
  deleteData("operations", { backup: true });
  const copy = appData.backups[0];
  return (
    appData.backups.length === backups + 1 &&
    copy.reason === "safety" &&
    copy.data.ops.length === ops &&
    appData.ops.length === 0
  );
});

check("A copy is made only for the ways that keep the backups", () => {
  withEverything();
  const backups = appData.backups.length;
  deleteData("backups", { backup: true });
  const none = appData.backups.length === 0;
  withEverything();
  deleteData("everything", { backup: true });
  return none && appData.backups.length === 0 && backups > 0;
});

check("A deletion that cannot be stored changes nothing", () => {
  withEverything();
  const before = appData;
  const held = counts().join();
  const original = globalThis.Storage.prototype.setItem;
  globalThis.Storage.prototype.setItem = () => {
    throw Error("full");
  };
  const outcomes = [];
  try {
    for (const id of Object.keys(DELETIONS)) {
      try {
        deleteData(id);
        outcomes.push(false);
      } catch {
        outcomes.push(appData === before && counts().join() === held);
      }
    }
  } finally {
    globalThis.Storage.prototype.setItem = original;
  }
  return outcomes.every(Boolean);
});

check("The filters and the selection do not outlive the data they point to", () => {
  withEverything();
  uiState.filters = { ...uiState.filters, accounts: ["cash"], categories: ["food"] };
  uiState.selected = [appData.ops[0].id];
  deleteData("partial");
  return (
    uiState.filters.accounts === null &&
    uiState.filters.categories === null &&
    !uiState.selected.length
  );
});

check(
  "Every way names what it deletes and asks for a word only where nothing brings the data back",
  () => {
    const ways = Object.values(DELETIONS);
    return (
      ways.every((w) => w.title && w.kinds.length && w.effects.length) &&
      ways
        .filter((w) => w.typed)
        .map((w) => w.title)
        .join() === "Delete local data" &&
      ways
        .filter((w) => w.backup)
        .map((w) => w.title)
        .join() === "Delete operations,Partial deletion"
    );
  },
);
