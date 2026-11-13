
## Hand-checked notes

Rows marked **no** are not gaps by themselves. What was checked, and the decision:

| Old place | Native counterpart | Decision |
|---|---|---|
| Page ids `savedBackups`, `restoreBackup`, `importColumns`, `importLinks`, `importPreview`, `importDone`, `importExample`, `exportPreview`, `accountEdit`, `budgetDetails` | `features/data.tsx` (backups, restore), `features/import-wizard.tsx`, `features/export-page.tsx`, `features/account-editor.tsx`, `app/budget-details.tsx` | same: the page exists, the id is only a key of the old router |
| Delete all saved backups? | `features/settings.tsx` Backups | made the same as the old (text and the toast "Backups deleted") |
| Delete selected operations? | `features/operations.tsx` `removeSelected` | adapted: longer text that names the consequences, and a backup is made first (kept on purpose) |
| Subcategory actions (title) | `features/category-editor.tsx` menu with the subcategory name as the heading | adapted: the old title text is not shown, the menu lists the same actions |
| List customization | `ui/customize-sheet.tsx` ("Icon list customization" / "Colors list customization") | same window, the title says which list |
| The file is ready. The browser asks for one more tap… | none | dropped: browser only, the native share sheet opens directly |
