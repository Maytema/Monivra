/* Entry point and public debug API */
import { runSelfChecks } from "./self-checks.js";
import { render } from "./shell.js";
import { startup } from "./startup.js";
import { TODAY } from "../core/constants.js";
import {
  appData,
  setAppData,
  setFirstLaunch,
  setLocked,
  setUiState,
  uiState,
} from "../core/state.js";
import { isTestMode } from "../core/test-mode.js";
import { createEmptyData } from "../data/defaults.js";
import { csvText, handleImport, parseCSV, prepareCSV } from "../data/import-export.js";
import { createSampleData } from "../data/sample.js";
import { isValidData, save } from "../data/storage.js";
import {
  accountBalance,
  convertCurrency,
  createBackup,
  dataSnapshot,
  evaluateExpression,
  operationMatchesFilters,
  overallBalance,
  periodBounds,
  reportRows,
  totalByType,
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
import { bulkEdit, filters } from "../screens/operations.js";
import { budgetSpend, editBudget, recurrence, reminder } from "../screens/scheduled-budgets.js";
import { statsSettings } from "../screens/statistics.js";
import {
  amountPicker,
  closeLayers,
  currencyPicker,
  goBack,
  goHome,
  iconPicker,
  openPage,
  openSheet,
  periodPicker,
  showInfo,
} from "../ui/kit.js";
import { actionHandlers, inputHandlers } from "../ui/primitives.js";

window.Monivra = {
  version: "1.0.0",
  runSelfChecks,
};
if (isTestMode()) {
  Object.assign(window.Monivra, {
    get data() {
      return appData;
    },
    state: () => uiState,
    getData: () => appData,
    setData: (x) => {
      setAppData(x);
    },
    sample: createSampleData,
    emptyData: createEmptyData,
    validData: isValidData,
    calculate: evaluateExpression,
    convert: convertCurrency,
    bal: accountBalance,
    overall: overallBalance,
    bounds: periodBounds,
    nextDate,
    putOperation,
    validateOp,
    deleteOperation,
    deleteAccount,
    deleteCategory,
    moveCategory,
    processScheduled,
    reportRows,
    totalType: totalByType,
    budgetSpend,
    matches: operationMatchesFilters,
    parseCSV,
    prepareCSV,
    csvText,
    snapshot: dataSnapshot,
    backup: createBackup,
    save,
    render,
    home: goHome,
    page: openPage,
    back: goBack,
    close: closeLayers,
    sheet: openSheet,
    info: showInfo,
    filters,
    periodPicker,
    accountPicker,
    categoryPicker,
    amountPicker,
    operationStart,
    accountActions,
    categoryActions,
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
    actions: () => actionHandlers,
    inputs: () => inputHandlers,
    invoke: (id) => actionHandlers[id]?.(),
    input: (id, value) => inputHandlers[id]?.(value),
    reset: () => {
      setAppData(createSampleData());
      setFirstLaunch(false);
      setUiState({
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
