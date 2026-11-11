# Architecture

The application is a single page. `index.html` loads the styles and `js/app/main.js`, which
calls `startup()`. There is no framework: a screen is a function that returns an HTML string,
and the whole page is drawn again after every change.

## Layers

Dependencies point down. A layer never imports from a layer above it.

```
app        shell (drawing, navigation roots), startup, gestures
screens    one module per screen or flow; builds HTML, wires taps to commands
ui         reusable pieces: buttons, fields, sheets, dialogs, pickers
domain     finance rules and commands on the data; no HTML, no DOM
data       data shapes, validation, storage, import and export
core       constants and the two state objects
platform   what the browser gives (files, printing, photos); a native shell would replace it
i18n       translation of the interface
```

Two exceptions are deliberate and small: `ui` and `screens` call `render()` from `app/shell.js`
to redraw, and `domain` commands call `save()` from `data/storage.js` to persist their result.

## State

- `appData` (`core/state.js`) is everything the person owns: accounts, categories, operations,
  scheduled payments, budgets, settings, rates, tags and backups. It is stored as one JSON
  document under `monivra.offline.2026.v1`. Old documents are completed by `completeData`
  (`data/defaults.js`) when they are loaded; a field that changed shape is migrated there.
- `uiState` is what is on the screen: tab, period, filters, selection, the stack of pages and
  the stack of sheets. It is never stored.
- Money is an integer in minor units (cents). Rates are fixed and editable; conversion rounds to
  one minor unit.

## Drawing

`render()` (`app/shell.js`) builds the HTML of the root view, the pages and the sheets, passes
it through `translateMarkup`, puts it into `#app` and restores the scroll position of every
scrolling container. Because markup is a string, taps and typing cannot hold closures.
Instead `ui/handlers.js` keeps a registry: `buttonHtml(label, fn)` stores `fn` and writes
`data-action="<id>"`; `startup.js` has one `click`, one `input` and one `change` listener on
the document that look the id up. The ids are rebuilt on every render.

## Navigation

`ui/navigation.js` owns two stacks. A **page** (`openPage`, `goBack`, `goHome`) replaces the
screen; a **layer** (`openSheet`, `closeLayers`) is a sheet or dialog above it. Both store a
function that builds their HTML, so they are redrawn with the rest. Pages are looked up by
`kind` in `app/shell.js`.

## Commands and checks

All changes to the data go through domain functions (`putOperation`, `storeAccount`,
`storeCategory`, `deleteCategory`, `applyBulkChanges`, `changeAccountCurrency`,
`restoreBackup`, `deleteData`, `applyImport` …). They throw `Error` with a message meant for the person when the input
is not acceptable; the click handler in `startup.js` shows it as a toast. A command that
deletes records returns what disappeared and the screen calls `forgetDeleted` so the selection
and the filters stop referring to it.

The editors keep a **draft** (a copy of the record plus form-only fields) and call a command
when the person confirms; nothing is written to `appData` while typing.

## Ready for what comes next

- **Native shells (Android, iOS):** everything that needs the browser's file, share, print or camera
  APIs is in `js/platform` (`files.js` makes, saves, picks and shares files and prints pages). A shell replaces those modules; nothing else knows about them.
- **Accounts and cloud sync:** the data is one serializable document with a version in its
  storage key, and every change goes through a command. Sync can wrap the commands or watch
  `save()`. Nothing is connected yet; the profile and subscription pages say so.
- **Subscriptions:** the pages exist as screens without a backend (`screens/more/info-pages.js`).
- **React:** domain, data, i18n and platform do not touch the DOM and can be reused as they are;
  screens are the part that would be rewritten.

## Scheduled payments

A scheduled payment is a record in `appData.scheduled` shaped like an operation, plus `recur`,
`reminder`, `time` (optional "HH:MM") and `anchorDay` (the day a monthly or yearly rule keeps).
`domain/scheduled.js` finds its next date and posts what came due: at launch and when the app
comes back to the screen, every occurrence up to today becomes an operation dated on its due day.
The operation carries `fromSchedule: { id, date }`: which payment and which occurrence (an occurrence is posted
once).
A scheduled payment dated today or earlier is posted as soon as it is saved. A payment far behind
(more than 31 occurrences missed, or the first one over a year ago) is not posted on its own:
`missedPayments` lists it and the person answers Add or Skip (`settleMissed`). A date more than a
year from today is confirmed before an operation is saved (`isFarDate`).
An operation dated after today is not kept among the operations: `putOperation` stores it as a
one-time scheduled payment.

Limit: a payment is posted only while the application code runs (launch, return to the screen, every
minute while open). Nothing is committed while the app is closed, and background code must not write the
WebView's `localStorage`. See [docs/SCHEDULED_AND_NOTIFICATIONS.md](docs/SCHEDULED_AND_NOTIFICATIONS.md) for the
review of reminders and the requirement for a future migration (background execution, shared database).

## Filters of the history

`uiState.filters` is `{ accounts, categories, types, tags, comment, origin }`; `null` is
"everything". A field is an OR over its choices and the fields are ANDed
(`operationMatchesFilters` in `domain/finance.js`). Categories are matched by exact id: choosing a
subcategory alone shows only its operations, not the parent's and not a same-named one under
another parent; transfers have no category, so any category filter leaves them out.
`origin` is `null` (all) or a list of `"manual"` and `"schedule"` (operations a scheduled payment
made have `fromSchedule`; `byHand` is set when the person added the payment ahead of time with
"Add now", so the list can say why an operation stands on its day). The history holds only what has happened; payments still to come
are listed in their own section. The period bar steps with `shiftPeriod`; "All time" has no
neighbours, so the arrows are disabled.
