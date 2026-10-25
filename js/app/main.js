/* Entry point and public debug API */
import { runSelfChecks } from "./self-checks.js";
import { render } from "./shell.js";
import { startup } from "./startup.js";
import { TODAY } from "../core/constants.js";
import { D, U, setD, setU } from "../core/state.js";
import { csvText, handleImport, parseCSV, prepareCSV } from "../data/import-export.js";
import { emptyData, seed } from "../data/seed.js";
import { save, validData } from "../data/storage.js";
import {
  backup,
  bal,
  bounds,
  calculate,
  convert,
  matches,
  overall,
  reportRows,
  snapshot,
  totalType,
} from "../domain/finance.js";
import {
  deleteAccount,
  deleteCategory,
  deleteOperation,
  moveCategory,
  nextDate,
  processScheduled,
  putOperation,
  validateOp,
} from "../domain/operations.js";
import { accountActions, editAccount, saveAccount } from "../screens/accounts.js";
import {
  accountPicker,
  categoryActions,
  categoryPicker,
  editCategory,
  saveCategory,
} from "../screens/categories.js";
import { pinSetup } from "../screens/more.js";
import { commitOperation, operationStart, tagsPicker } from "../screens/operation-editor.js";
import { bulkEdit, filters, operationDetails } from "../screens/operations.js";
import { budgetSpend, editBudget, recurrence, reminder } from "../screens/scheduled-budgets.js";
import { statsSettings } from "../screens/statistics.js";
import {
  amountPicker,
  back,
  close,
  currencyPicker,
  home,
  iconPicker,
  info,
  page,
  periodPicker,
  sheet,
} from "../ui/kit.js";
import { actions, inputs, locked, setLocked } from "../ui/primitives.js";

window.Monivra = {
  version: "1.0.0",
  runSelfChecks,
};
if (window.__MONIVRA_TEST__) {
  Object.assign(window.Monivra, {
    get data() {
      return D;
    },
    state: () => U,
    getData: () => D,
    setData: (x) => {
      setD(x);
    },
    seed,
    emptyData,
    validData,
    calculate,
    convert,
    bal,
    overall,
    bounds,
    nextDate,
    putOperation,
    validateOp,
    deleteOperation,
    deleteAccount,
    deleteCategory,
    moveCategory,
    processScheduled,
    reportRows,
    totalType,
    budgetSpend,
    matches,
    parseCSV,
    prepareCSV,
    csvText,
    snapshot,
    backup,
    save,
    render,
    home,
    page,
    back,
    close,
    sheet,
    info,
    filters,
    periodPicker,
    accountPicker,
    categoryPicker,
    amountPicker,
    operationStart,
    accountActions,
    categoryActions,
    operationDetails,
    editAccount,
    editCategory,
    editBudget,
    bulkEdit,
    saveAccount,
    saveCategory,
    commitOperation,
    recurrence,
    reminder,
    iconPicker,
    currencyPicker,
    tagsPicker,
    statsSettings,
    pinSetup,
    handleImport,
    actions: () => actions,
    inputs: () => inputs,
    invoke: (id) => actions[id]?.(),
    input: (id, value) => inputs[id]?.(value),
    reset: () => {
      setD(seed());
      setU({
        tab: "accounts",
        accountTab: "Accounts",
        catType: "expense",
        period: { mode: "month", anchor: TODAY },
        archive: false,
        manageArchive: false,
        selected: [],
        selection: false,
        search: false,
        filters: {
          accounts: null,
          categories: null,
          types: null,
          tags: null,
          comment: "",
        },
        donut: null,
        pages: [],
        layers: [],
        reorder: false,
      });
      setLocked(false);
      render();
    },
  });
  render();
} else startup();
