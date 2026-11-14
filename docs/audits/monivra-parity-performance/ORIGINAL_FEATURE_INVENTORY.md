# Инвентарь старого приложения (из исходников)

Собран скриптом `tools/audit/inventory.mjs` из `js/` (js/ (first application) and mobile/src (React Native)). Полная таблица со статусами — `PARITY_MATRIX.csv`, машинный вид — `inventory.json`, переходы — `NAVIGATION_GRAPH.md`.

Как читать статусы: **SOURCE-MAPPED** — в коде нового приложения найден тот же экран/надпись (это не проверка поведения); **EXERCISED ON RN EMULATOR** — элемент нажимался в эмуляторном обходе нового приложения (`mobile/scripts/emulator-smoke.sh`), со скриншотом; **UNTESTED** — не нажимался; «label computed» — надпись строится в коде, сопоставить автоматически нельзя.


## Экраны (55)

| ID | Экран старого приложения | Файл нового |
|---|---|---|
| SC-001 | `tab:accounts` | `app/(tabs)/index.tsx` |
| SC-002 | `tab:categories` | `app/(tabs)/categories.tsx` |
| SC-003 | `tab:operations` | `app/(tabs)/operations.tsx` |
| SC-004 | `tab:statistics` | `app/(tabs)/statistics.tsx` |
| SC-005 | `tab:more` | `app/(tabs)/more.tsx` |
| SC-006 | `accountEdit` | `app/account.tsx` |
| SC-007 | `accountType` | `features/account-editor.tsx (type step)` |
| SC-008 | `filtered` | `app/filtered.tsx` |
| SC-009 | `categoryEdit` | `app/category.tsx` |
| SC-010 | `categoryManage` | `app/categories-manage.tsx` |
| SC-011 | `scheduled` | `app/scheduled.tsx` |
| SC-012 | `budgets` | `app/budgets.tsx` |
| SC-013 | `budgetDetails` | `app/budget-details.tsx` |
| SC-014 | `budget` | `app/budget.tsx` |
| SC-015 | `settings` | `app/settings.tsx` |
| SC-016 | `data` | `app/data.tsx` |
| SC-017 | `deletion` | `features/data.tsx (deletion)` |
| SC-018 | `dataFile` | `features/data.tsx (data file)` |
| SC-019 | `importData` | `features/data.tsx (import)` |
| SC-020 | `export` | `features/export-page.tsx` |
| SC-021 | `savedBackups` | `features/data.tsx (backups)` |
| SC-022 | `restoreBackup` | `features/data.tsx (restore)` |
| SC-023 | `exportPreview` | `features/export-page.tsx (Preview)` |
| SC-024 | `importColumns` | `features/import-wizard.tsx` |
| SC-025 | `importLinks` | `features/import-wizard.tsx` |
| SC-026 | `importPreview` | `features/import-wizard.tsx` |
| SC-027 | `importDone` | `features/import-wizard.tsx` |
| SC-028 | `importExample` | `features/import-wizard.tsx` |
| SC-029 | `notifications` | `app/settings-page.tsx` |
| SC-030 | `security` | `app/settings-page.tsx` |
| SC-031 | `privacy` | `app/settings-page.tsx` |
| SC-032 | `backups` | `app/settings-page.tsx` |
| SC-033 | `rates` | `app/rates.tsx` |
| SC-034 | `profile` | `app/info.tsx` |
| SC-035 | `subscription` | `app/info.tsx` |
| SC-036 | `shared` | `app/info.tsx` |
| SC-037 | `instructions` | `app/info.tsx` |
| SC-038 | `support` | `app/info.tsx` |
| SC-039 | `about` | `app/info.tsx` |
| SC-040 | `privacyPolicy` | `app/info.tsx` |
| SC-041 | `terms` | `app/info.tsx` |
| SC-042 | `elementsOperations` | `app/settings-page.tsx` |
| SC-043 | `elementsAccounts` | `app/settings-page.tsx` |
| SC-044 | `elementsCategories` | `app/settings-page.tsx` |
| SC-045 | `elementsKeyboard` | `app/settings-page.tsx` |
| SC-046 | `formatting` | `app/settings-page.tsx` |
| SC-047 | `styles` | `app/settings-page.tsx` |
| SC-048 | `stylesGlobal` | `app/settings-page.tsx` |
| SC-049 | `stylesColor` | `app/settings-page.tsx` |
| SC-050 | `stylesNavigation` | `app/settings-page.tsx` |
| SC-051 | `stylesElements` | `app/settings-page.tsx` |
| SC-052 | `stylesLanguage` | `app/settings-page.tsx` |
| SC-053 | `special:welcome` | `features/welcome.tsx` |
| SC-054 | `special:recovery` | `features/recovery.tsx` |
| SC-055 | `special:lock` | `features/lock.tsx` |

## Переходы на страницы (openPage) (31)

| Файл старого приложения | Сколько | Элементы (ID: надпись → статус) |
|---|---|---|
| `js/data/import-export.js` | 5 | RT-0001: savedBackups → mapped; RT-0002: dataFile → mapped; RT-0003: importData → mapped; RT-0004: deletion → mapped; RT-0005: importExample → mapped |
| `js/screens/accounts/edit.js` | 1 | RT-0006: (computed) → computed |
| `js/screens/accounts/list.js` | 1 | RT-0007: categoryManage → mapped |
| `js/screens/accounts/type.js` | 1 | RT-0008: accountEdit → mapped |
| `js/screens/budgets.js` | 3 | RT-0009: budgets → mapped; RT-0010: budget → mapped; RT-0011: budgetDetails → mapped |
| `js/screens/categories.js` | 1 | RT-0012: categoryEdit → mapped |
| `js/screens/export.js` | 2 | RT-0013: export → mapped; RT-0014: exportPreview → mapped |
| `js/screens/import-wizard.js` | 4 | RT-0015: importColumns → mapped; RT-0016: importLinks → mapped; RT-0017: importPreview → mapped; RT-0018: importDone → mapped |
| `js/screens/more/backup-pages.js` | 2 | RT-0019: restoreBackup → mapped; RT-0020: restoreBackup → mapped |
| `js/screens/more/menu.js` | 2 | RT-0021: (computed) → computed; RT-0022: shared → mapped |
| `js/screens/more/settings-pages.js` | 1 | RT-0023: savedBackups → mapped |
| `js/screens/more/support.js` | 3 | RT-0024: (computed) → computed; RT-0025: (computed) → computed; RT-0026: instructions → mapped |
| `js/screens/operation-editor/editor.js` | 1 | RT-0027: scheduled → mapped |
| `js/screens/operations/list.js` | 1 | RT-0028: filtered → mapped |
| `js/screens/settings.js` | 2 | RT-0029: (computed) → computed; RT-0030: (computed) → computed |
| `js/screens/statistics.js` | 1 | RT-0031: scheduled → mapped |

## Окна и подтверждения (openSheet / confirmAction) (82)

| Файл старого приложения | Сколько | Элементы (ID: надпись → статус) |
|---|---|---|
| `js/screens/accounts/actions.js` | 1 | OV-0001: Debit → mapped |
| `js/screens/accounts/currency-change.js` | 1 | OV-0002: Change account currency → mapped |
| `js/screens/accounts/edit.js` | 1 | OV-0003: Delete this account and all linked opera → mapped |
| `js/screens/accounts/type.js` | 1 | OV-0004: Account type → EXERCISED |
| `js/screens/budgets.js` | 1 | OV-0005: Delete this budget? → mapped |
| `js/screens/categories.js` | 11 | OV-0006: Operations → EXERCISED; OV-0007: Choose a category → mapped; OV-0008: (computed) → computed; OV-0009: (computed) → computed; OV-0010: Subcategory actions → INTENTIONAL; OV-0011: Delete this subcategory and its associat → mapped; OV-0012: The planned actions on subcategories wil → mapped; OV-0013: Select type → mapped; OV-0014: Subcategory actions → INTENTIONAL; OV-0015: Subcategory → mapped; OV-0016: (computed) → computed |
| `js/screens/category-select.js` | 1 | OV-0017: Select categories → mapped |
| `js/screens/due-payments.js` | 1 | OV-0018: (computed) → computed |
| `js/screens/fees.js` | 2 | OV-0019: Cancel → EXERCISED; OV-0020: Information about calculation → mapped |
| `js/screens/import-wizard.js` | 3 | OV-0021: Cancel → EXERCISED; OV-0022: (computed) → computed; OV-0023: (computed) → computed |
| `js/screens/more/backup-pages.js` | 1 | OV-0024: (computed) → computed |
| `js/screens/more/deletion-page.js` | 1 | OV-0025: Cancel → EXERCISED |
| `js/screens/more/settings-pages.js` | 2 | OV-0026: PIN → INTENTIONAL; OV-0027: Delete all saved backups? They cannot be → mapped |
| `js/screens/operation-editor/actions.js` | 2 | OV-0028: Delete this operation? → mapped; OV-0029: Skip this occurrence? → mapped |
| `js/screens/operation-editor/editor.js` | 1 | OV-0030: (computed) → computed |
| `js/screens/operation-editor/extras.js` | 4 | OV-0031: Select tags → mapped; OV-0032: Remove this tag from all operations? → mapped; OV-0033: Add photo → mapped; OV-0034: Photo → mapped |
| `js/screens/operation-editor/keypad.js` | 1 | OV-0035: Additionally → EXERCISED |
| `js/screens/operation-editor/parties.js` | 2 | OV-0036: Accounts → EXERCISED; OV-0037: (computed) → computed |
| `js/screens/operation-editor/start.js` | 1 | OV-0038: Add an operation → mapped |
| `js/screens/operations/add-menu.js` | 1 | OV-0039: Add an operation → mapped |
| `js/screens/operations/bulk-edit.js` | 6 | OV-0040: Delete selected operations? → INTENTIONAL; OV-0041: For transfers → mapped; OV-0042: Tags → mapped; OV-0043: Comment → mapped; OV-0044: The selected changes will be applied to  → mapped; OV-0045: Bulk edit → mapped |
| `js/screens/operations/category-filter.js` | 1 | OV-0046: Filter by categories → mapped |
| `js/screens/operations/filters.js` | 3 | OV-0047: (computed) → computed; OV-0048: Accounts → EXERCISED; OV-0049: Filters → EXERCISED |
| `js/screens/pickers.js` | 2 | OV-0050: Account → mapped; OV-0051: Category → mapped |
| `js/screens/rates.js` | 1 | OV-0052: Every rate returns to its example value  → mapped |
| `js/screens/recovery.js` | 1 | OV-0053: Start with empty data? What could not be → mapped |
| `js/screens/recurrence.js` | 4 | OV-0054: Recur → EXERCISED; OV-0055: (computed) → computed; OV-0056: Important information about setting a re → mapped; OV-0057: Reminder → EXERCISED |
| `js/screens/scheduled-budgets.js` | 1 | OV-0058: Select date → EXERCISED |
| `js/screens/settings.js` | 1 | OV-0059: Currency format → mapped |
| `js/screens/statistics.js` | 1 | OV-0060: Statistics → EXERCISED |
| `js/ui/calendar.js` | 2 | OV-0061: Select date → EXERCISED; OV-0062: Select range → mapped |
| `js/ui/currency-picker.js` | 1 | OV-0063: Select currency → mapped |
| `js/ui/dialogs.js` | 6 | OV-0064: (computed) → computed; OV-0065: (computed) → computed; OV-0066: Cancel → EXERCISED; OV-0067: Cancel → EXERCISED; OV-0068: (computed) → computed; OV-0069: Menu → mapped |
| `js/ui/file-actions.js` | 3 | OV-0070: (computed) → computed; OV-0071: The file is ready. The browser asks for  → INTENTIONAL; OV-0072: Cancel → EXERCISED |
| `js/ui/icon-picker.js` | 5 | OV-0073: Setting random selection → mapped; OV-0074: Select an icon → mapped; OV-0075: List customization → INTENTIONAL; OV-0076: Choose color → EXERCISED; OV-0077: Customize icon → mapped |
| `js/ui/number-picker.js` | 2 | OV-0078: Use a non-negative amount → mapped; OV-0079: (computed) → computed |
| `js/ui/period-picker.js` | 2 | OV-0080: Month starts on → mapped; OV-0081: Time interval → mapped |
| `js/ui/time-picker.js` | 1 | OV-0082: Select time → mapped |

## Кнопки и действия (data-action, onclick, кнопки окон) (344)

| Файл старого приложения | Сколько | Элементы (ID: надпись → статус) |
|---|---|---|
| `js/app/shell.js` | 1 | AC-0001: (computed) → computed |
| `js/data/import-export.js` | 10 | AC-0002: Restore from file → EXERCISED; AC-0003: (computed) → computed; AC-0004: (computed) → computed; AC-0005: Select CSV file → mapped; AC-0006: View example → EXERCISED; AC-0007: Saved backups → EXERCISED; AC-0008: Data file → EXERCISED; AC-0009: Import data → EXERCISED; AC-0010: Export data → EXERCISED; AC-0011: Delete my data → EXERCISED |
| `js/screens/accounts/actions.js` | 1 | AC-0012: (computed) → computed |
| `js/screens/accounts/currency-change.js` | 4 | AC-0013: Change currency → mapped; AC-0014: Convert everything at the current rate → mapped; AC-0015: (computed) → computed; AC-0016: Cancel → EXERCISED |
| `js/screens/accounts/edit.js` | 13 | AC-0017: (computed) → computed; AC-0018: Delete → mapped; AC-0019: (computed) → computed; AC-0020: (computed) → computed; AC-0021: (computed) → computed; AC-0022: (computed) → computed; AC-0023: Account → mapped; AC-0024: Type of debt → mapped; AC-0025: Account currency → EXERCISED; AC-0026: Icon → EXERCISED; AC-0027: Account type → EXERCISED; AC-0028: Title → mapped; AC-0029: Description → mapped |
| `js/screens/accounts/list.js` | 7 | AC-0030: (computed) → computed; AC-0031: (computed) → computed; AC-0032: (computed) → computed; AC-0033: Create → EXERCISED; AC-0034: (computed) → computed; AC-0035: Close search → EXERCISED; AC-0036: (computed) → computed |
| `js/screens/accounts/type.js` | 2 | AC-0037: (computed) → computed; AC-0038: Back → mapped |
| `js/screens/budgets.js` | 11 | AC-0039: (computed) → computed; AC-0040: Create a budget → EXERCISED; AC-0041: (computed) → computed; AC-0042: (computed) → computed; AC-0043: Delete → mapped; AC-0044: Create a budget → EXERCISED; AC-0045: Edit budget → mapped; AC-0046: Time period → mapped; AC-0047: Categories → EXERCISED; AC-0048: Budget currency → mapped; AC-0049: Title → mapped |
| `js/screens/categories.js` | 33 | AC-0050: (computed) → computed; AC-0051: Create → EXERCISED; AC-0052: (computed) → computed; AC-0053: Cancel → EXERCISED; AC-0054: (computed) → computed; AC-0055: (computed) → computed; AC-0056: Add subcategory → mapped; AC-0057: Cancel → EXERCISED; AC-0058: OK → EXERCISED; AC-0059: (computed) → computed; AC-0060: Nest into category → mapped; AC-0061: Move into category → mapped; AC-0062: (computed) → computed; AC-0063: Delete → mapped; AC-0064: (computed) → computed; AC-0065: (computed) → computed; AC-0066: (computed) → computed; AC-0067: (computed) → computed; AC-0068: (computed) → computed; AC-0069: Edit → EXERCISED; AC-0070: Move to a category → mapped; AC-0071: Merge into a subcategory → mapped; AC-0072: Convert to a category → mapped; AC-0073: (computed) → computed; AC-0074: Delete → mapped; AC-0075: Edit → EXERCISED; AC-0076: Delete → mapped; AC-0077: Icon → EXERCISED; AC-0078: Type → mapped; AC-0079: Category currency → mapped; AC-0080: Title → mapped; AC-0081: Edit → EXERCISED; AC-0082: Operations → EXERCISED |
| `js/screens/category-select.js` | 7 | AC-0083: (computed) → computed; AC-0084: (computed) → computed; AC-0085: (computed) → computed; AC-0086: Cancel → EXERCISED; AC-0087: Confirm → EXERCISED; AC-0088: Subcategories → mapped; AC-0089: Close → mapped |
| `js/screens/due-payments.js` | 2 | AC-0090: (computed) → computed; AC-0091: Dismiss → mapped |
| `js/screens/export.js` | 5 | AC-0092: (computed) → computed; AC-0093: (computed) → computed; AC-0094: (computed) → computed; AC-0095: (computed) → computed; AC-0096: Preview → EXERCISED |
| `js/screens/fees.js` | 11 | AC-0097: Cancel → EXERCISED; AC-0098: OK → EXERCISED; AC-0099: I understood → mapped; AC-0100: (computed) → computed; AC-0101: Change order → mapped; AC-0102: Remove → mapped; AC-0103: Help → mapped; AC-0104: Subtract from operation → mapped; AC-0105: Add to operation → mapped; AC-0106: Percent → mapped; AC-0107: Value → mapped |
| `js/screens/import-wizard.js` | 10 | AC-0108: (computed) → computed; AC-0109: Cancel → EXERCISED; AC-0110: (computed) → computed; AC-0111: Next → mapped; AC-0112: Preview → EXERCISED; AC-0113: Save the list of these rows → mapped; AC-0114: (computed) → computed; AC-0115: Show operations → mapped; AC-0116: Take back this import → mapped; AC-0117: Download CSV → mapped |
| `js/screens/more/backup-pages.js` | 6 | AC-0118: Create a backup → EXERCISED; AC-0119: (computed) → computed; AC-0120: (computed) → computed; AC-0121: (computed) → computed; AC-0122: Merge data → mapped; AC-0123: Replace data → EXERCISED |
| `js/screens/more/deletion-page.js` | 5 | AC-0124: (computed) → computed; AC-0125: Save a data file first → mapped; AC-0126: Delete → mapped; AC-0127: Cancel → EXERCISED; AC-0128: (computed) → computed |
| `js/screens/more/info-pages.js` | 6 | AC-0129: Sign out → mapped; AC-0130: Delete account → mapped; AC-0131: Continue → mapped; AC-0132: (computed) → computed; AC-0133: (computed) → computed; AC-0134: Back → mapped |
| `js/screens/more/lock.js` | 3 | AC-0135: (computed) → computed; AC-0136: (computed) → computed; AC-0137: (computed) → computed |
| `js/screens/more/menu.js` | 1 | AC-0138: (computed) → computed |
| `js/screens/more/settings-pages.js` | 9 | AC-0139: (computed) → computed; AC-0140: Time → mapped; AC-0141: Test notification → TEXT DIFF; AC-0142: Lock now → EXERCISED; AC-0143: Saved backups → EXERCISED; AC-0144: Delete all local data copies → mapped; AC-0145: Notifications → mapped; AC-0146: Unlock with fingerprint or face → mapped; AC-0147: PIN code → EXERCISED |
| `js/screens/more/support.js` | 5 | AC-0148: View instructions → mapped; AC-0149: Continue → mapped; AC-0150: Repeat hints → mapped; AC-0151: (computed) → computed; AC-0152: (computed) → computed |
| `js/screens/operation-editor/actions.js` | 4 | AC-0153: Skip → mapped; AC-0154: Add now → mapped; AC-0155: Delete → mapped; AC-0156: Duplicate → mapped |
| `js/screens/operation-editor/amount.js` | 2 | AC-0157: (computed) → computed; AC-0158: (custom markup) → computed |
| `js/screens/operation-editor/extras.js` | 15 | AC-0159: (computed) → computed; AC-0160: (computed) → computed; AC-0161: Complete → EXERCISED; AC-0162: (computed) → computed; AC-0163: (computed) → computed; AC-0164: (computed) → computed; AC-0165: (computed) → computed; AC-0166: Close → mapped; AC-0167: Remove photo → mapped; AC-0168: Clear comment → mapped; AC-0169: Comment → mapped; AC-0170: Tags → mapped; AC-0171: Take a photo → mapped; AC-0172: Choose from gallery → EXERCISED; AC-0173: (custom markup) → computed |
| `js/screens/operation-editor/keypad.js` | 12 | AC-0174: (computed) → computed; AC-0175: (computed) → computed; AC-0176: (computed) → computed; AC-0177: (computed) → computed; AC-0178: (computed) → computed; AC-0179: (computed) → computed; AC-0180: Fill max → mapped; AC-0181: Time → mapped; AC-0182: Reminder → EXERCISED; AC-0183: Recur → EXERCISED; AC-0184: Tax → mapped; AC-0185: Commission → mapped |
| `js/screens/operation-editor/parties.js` | 2 | AC-0186: (computed) → computed; AC-0187: (computed) → computed |
| `js/screens/operation-editor/view.js` | 4 | AC-0188: (computed) → computed; AC-0189: Click on the value to edit → INTENTIONAL; AC-0190: Previous day → mapped; AC-0191: Next day → mapped |
| `js/screens/operations/add-menu.js` | 2 | AC-0192: (computed) → computed; AC-0193: (computed) → computed |
| `js/screens/operations/bulk-edit.js` | 16 | AC-0194: (computed) → computed; AC-0195: (computed) → computed; AC-0196: (computed) → computed; AC-0197: (computed) → computed; AC-0198: Sender → mapped; AC-0199: Receiver → mapped; AC-0200: Cancel → EXERCISED; AC-0201: (computed) → computed; AC-0202: (computed) → computed; AC-0203: (computed) → computed; AC-0204: Complete → EXERCISED; AC-0205: (computed) → computed; AC-0206: Complete → EXERCISED; AC-0207: Cancel → EXERCISED; AC-0208: Confirm → EXERCISED; AC-0209: Clear → mapped |
| `js/screens/operations/category-filter.js` | 4 | AC-0210: Collapse all → mapped; AC-0211: Expand all → mapped; AC-0212: (custom markup) → computed; AC-0213: (custom markup) → computed |
| `js/screens/operations/filter-parts.js` | 2 | AC-0214: Cancel → EXERCISED; AC-0215: Confirm → EXERCISED |
| `js/screens/operations/filters.js` | 8 | AC-0216: (computed) → computed; AC-0217: (computed) → computed; AC-0218: Reset all → mapped; AC-0219: Apply → mapped; AC-0220: (computed) → computed; AC-0221: (custom markup) → computed; AC-0222: (custom markup) → computed; AC-0223: (custom markup) → computed |
| `js/screens/operations/list.js` | 6 | AC-0224: (computed) → computed; AC-0225: (computed) → computed; AC-0226: Filtered data → mapped; AC-0227: Exit selection → EXERCISED; AC-0228: Clear filters → mapped; AC-0229: Add → mapped |
| `js/screens/pickers.js` | 2 | AC-0230: (computed) → computed; AC-0231: (computed) → computed |
| `js/screens/rates.js` | 5 | AC-0232: (computed) → computed; AC-0233: (computed) → computed; AC-0234: Restore example rates → mapped; AC-0235: Automatic rates → mapped; AC-0236: Code, name or country → mapped |
| `js/screens/recovery.js` | 5 | AC-0237: Save a copy of the data → mapped; AC-0238: Share the copy → mapped; AC-0239: (computed) → computed; AC-0240: Restore from a data file → mapped; AC-0241: Start with empty data → mapped |
| `js/screens/recurrence.js` | 11 | AC-0242: Turn off → mapped; AC-0243: Cancel → EXERCISED; AC-0244: OK → EXERCISED; AC-0245: (computed) → computed; AC-0246: OK → EXERCISED; AC-0247: OK → EXERCISED; AC-0248: Important information about setting a re → mapped; AC-0249: At → mapped; AC-0250: Repeat every → mapped; AC-0251: Number of repetitions → mapped; AC-0252: Before → mapped |
| `js/screens/scheduled-budgets.js` | 7 | AC-0253: (computed) → computed; AC-0254: (computed) → computed; AC-0255: (computed) → computed; AC-0256: Complete → EXERCISED; AC-0257: Create → EXERCISED; AC-0258: Sort by date → mapped; AC-0259: Add → mapped |
| `js/screens/settings.js` | 14 | AC-0260: (computed) → computed; AC-0261: Cancel → EXERCISED; AC-0262: Save → EXERCISED; AC-0263: (computed) → computed; AC-0264: (computed) → computed; AC-0265: (computed) → computed; AC-0266: (computed) → computed; AC-0267: (computed) → computed; AC-0268: Main currency → EXERCISED; AC-0269: Currency format → mapped; AC-0270: Start of month → mapped; AC-0271: Statistics → EXERCISED; AC-0272: (computed) → computed; AC-0273: (computed) → computed |
| `js/screens/statistics.js` | 7 | AC-0274: Operations → EXERCISED; AC-0275: (computed) → computed; AC-0276: (computed) → computed; AC-0277: (computed) → computed; AC-0278: Complete → EXERCISED; AC-0279: (computed) → computed; AC-0280: (custom markup) → computed |
| `js/screens/welcome.js` | 2 | AC-0281: Start with basic set → EXERCISED; AC-0282: Start empty → mapped |
| `js/ui/calendar.js` | 11 | AC-0283: (computed) → computed; AC-0284: (computed) → computed; AC-0285: (computed) → computed; AC-0286: Today → mapped; AC-0287: Cancel → EXERCISED; AC-0288: OK → EXERCISED; AC-0289: (computed) → computed; AC-0290: Cancel → EXERCISED; AC-0291: OK → EXERCISED; AC-0292: Previous month → mapped; AC-0293: Next month → mapped |
| `js/ui/currency-picker.js` | 4 | AC-0294: (computed) → computed; AC-0295: (computed) → computed; AC-0296: Close → mapped; AC-0297: Code, name or country → mapped |
| `js/ui/dialogs.js` | 9 | AC-0298: OK → EXERCISED; AC-0299: (computed) → computed; AC-0300: (computed) → computed; AC-0301: Cancel → EXERCISED; AC-0302: OK → EXERCISED; AC-0303: Cancel → EXERCISED; AC-0304: Cancel → EXERCISED; AC-0305: (computed) → computed; AC-0306: (computed) → computed |
| `js/ui/file-actions.js` | 1 | AC-0307: Cancel → EXERCISED |
| `js/ui/hint.js` | 2 | AC-0308: (computed) → computed; AC-0309: Dismiss → mapped |
| `js/ui/icon-picker.js` | 15 | AC-0310: (computed) → computed; AC-0311: Cancel → EXERCISED; AC-0312: Complete → EXERCISED; AC-0313: (computed) → computed; AC-0314: (computed) → computed; AC-0315: (computed) → computed; AC-0316: (computed) → computed; AC-0317: Cancel → EXERCISED; AC-0318: Complete → EXERCISED; AC-0319: (computed) → computed; AC-0320: (computed) → computed; AC-0321: (computed) → computed; AC-0322: Complete → EXERCISED; AC-0323: (computed) → computed; AC-0324: Complete → EXERCISED |
| `js/ui/number-picker.js` | 7 | AC-0325: (computed) → computed; AC-0326: (computed) → computed; AC-0327: (computed) → computed; AC-0328: 0 → mapped; AC-0329: . → mapped; AC-0330: (computed) → computed; AC-0331: (computed) → computed |
| `js/ui/period-picker.js` | 6 | AC-0332: (computed) → computed; AC-0333: (computed) → computed; AC-0334: (computed) → computed; AC-0335: Cancel → EXERCISED; AC-0336: Previous period → mapped; AC-0337: Next period → mapped |
| `js/ui/primitives.js` | 1 | AC-0338: (custom markup) → computed |
| `js/ui/time-picker.js` | 6 | AC-0339: (computed) → computed; AC-0340: (computed) → computed; AC-0341: (computed) → computed; AC-0342: Cancel → EXERCISED; AC-0343: OK → EXERCISED; AC-0344: (computed) → computed |
