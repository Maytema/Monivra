# Migration status (checkpoint log)

The owner approved the migration on 2026-11-11 (React Native + Expo, export/import for existing data,
F-1 fixed, account deletion kept as is, free exchange-rate sources with replaceable providers).
Work branch: `rn-migration` (from `docs/react-native-architecture`). `main`, `android-first-apk` and
the first application are untouched; the first application stays the reference.

## How to resume

1. `git checkout rn-migration`; the new application is in `mobile/`.
2. Local checks need no install: `cd mobile && node --test test/*.test.ts` (Node 22, `node:sqlite`) and
   `tsc -p tsconfig.core.json` (domain, data, services, application).
3. Everything with React Native (types, APK) is checked by `.github/workflows/mobile.yml` on GitHub.
4. To refresh the parity reference after a change of the first application:
   `node mobile/test/parity/run-old.mjs` (Playwright runs the old code on the shared fixtures).

## Checkpoints

| # | State | What |
| - | ----- | ---- |
| 1 | done  | Domain core in TypeScript (money, ledger, periods, operations, scheduled, accounts, categories, budgets, data file v1), pure, with explicit recalculation rules |
| 2 | done  | SQLite schema v1 (constraints: unique occurrence, deferred foreign keys, type checks), one transaction per change, verified import |
| 3 | done  | Exchange-rate sources behind one interface, fallback chain, time limits, merge per currency, never blocking |
| 4 | done  | Parity harness: the old code's results on 3 fixtures recorded; the new domain matches them |
| 5 | done  | Store (application layer) over SQLite; tests with a real database |
| 6 | done  | Expo application: screens for accounts, operations (period, search, filters), editor (calculator, two currencies, fees, repeat, reminder, tags), categories, statistics, scheduled (Add now / Skip / far behind), budgets, rates, data (data file in/out, CSV), settings |
| 7 | done  | Reminders as local notifications (plan identical to the old one — parity test), background task for posting (WorkManager/BGTaskScheduler via expo-background-task), PIN lock with keystore and fingerprint |
| 8 | done  | CI: types, tests, release APK; emulator smoke test; results published to branch `mobile-builds` (new commits only) |

### Interface fidelity phase (second pass)

Written from the first application's code and `catalog/`; **checked locally only** (types with stubbed
platform modules, 45 domain/database tests, boundary check). Nothing below is claimed to look right on a
device until the emulator screenshots of the CI run have been compared with `catalog/`.

| # | State | What |
| - | ----- | ---- |
| 9  | coded | Bottom bar and screens follow the system insets (no fixed heights); sheet/dialog layer inside the app (`ui/sheets.tsx`), notice line, dialogs (`ui/dialogs.tsx`) |
| 10 | coded | Operation editor as a bottom sheet: date row, tiles, dual amounts, calculator keypad (double tap = calculator), Additionally, tax/commission, repeat, reminder, tags, party picker |
| 11 | coded | Categories (tiles, sum tabs, manage page, sheet, form with subcategory plans), statistics (blocks), More menu, info pages |
| 12 | coded | Scheduled payments page (sort, day groups, details, "Select date" dialog, missed-payments question) |
| 13 | coded | Account form (type step, customize icon/colour, calculator sheet, currency-change preview sheet), budgets (list, page, form, category selection), settings tree, rates page, currency sheet with search, bulk edit sheet, time dialog with a dial |

## Decisions taken while implementing (routine, reversible)

- **Store = SQLite + in-memory ledger.** The database is the source of truth; commands run on a working
  copy (`LedgerTx`), are written in one transaction, then become the state. Reports read the in-memory
  ledger with the same pure functions as the parity tests. Hot queries can move to SQL later
  (`account_balance` view already exists and is cross-checked in tests).
- **Schema simplifications vs DATA_MIGRATION_PLAN §2:** fees, tags, photos, repeat and reminder are JSON
  columns of the record (they are always read with it); tags stay names (Q-F5 not decided). Unknown
  fields go to `extra_json`, so a data file loses nothing.
- **Occurrence ids are deterministic** (`<payment id>~<occurrence day>`), plus a unique index.
- **Translation** is a 60-line module with the old semantics (English keys, `ru.json` copied by a script,
  Russian plural forms) instead of i18next — no new dependency, same table.
- **Application id of the new app:** `app.monivra.finance.next` — side by side with the first
  application's `app.monivra.finance(.dev)`, which are not used or changed.
- **INTERNET permission** in the new app, used only for exchange rates (the owner asked for online
  rates). Nothing about the person is sent.

## Found on the emulator (CI smoke test)

- Build 5: the release APK stopped at start — WorkManager's Room database constructor was removed by
  code shrinking (`WorkDatabase_Impl.<init>`). Fixed with keep rules (expo-build-properties); build 6 starts.
- Build 6: first start, the basic set, the accounts screen and the calculator work; saving an expense
  without a category is refused with "Select a category" (correct). The smoke test now picks a category.
- **Build 7 (commit `990d22b`): all green** — types, 37 tests, release APK, emulator smoke test passed
  (first start → basic set → expense 125 by the calculator with a category → shown on the account and in
  the history → still there after the app is stopped and started again → no crash). Re-signed with the
  owner's test key (certificate SHA-256 `7e041ae5…bc9784`): `Monivra-RN-0.2.0-build.7.apk`, SHA-256
  `2925960c34ac3d8f1669b8fb8d85344bc84807b6459cf772ead4500347cf2463`.
- Not checked by any automated test yet: import of a real data file on the phone, notifications delivered
  by the system, the background task actually running, PIN/fingerprint, rates from the network on the phone.

## Fixed defects of the first application (approved difference from parity)

| ID | Defect | Fix | Test |
| -- | ------ | --- | ---- |
| F-1 | Saving an unrelated change (tag, comment, date) re-priced a cross-currency amount at today's rate | Second amounts are facts; re-priced only when the amount, fees or a side's currency changes and the person did not type it | `finance-rules.test.ts` (3 tests) |
| F-14 | Changing one account's currency with "convert everything" converted **every adjustment of every account** and counted scheduled payments in the balance correction — another account lost money, and the changed account ended at the wrong balance (probe: 2,200.00 → 1,211.43 KGS on the other account; 705.33 instead of 211.05 USD) | Only the account's own records are converted; the correction counts operations only | `finance-rules.test.ts` "F-14" |

## Parity pass after the owner's film (2026-11-12, task `docs/agent/PARITY_TASK.md`)

Verified on the CI emulator (screenshots in `mobile-builds/builds/<n>/emulator/`): swipe over periods
(build 27), long press → selection mode, calendar from the operation editor, the operations list after a
change (build 28). Coded after the film and the catalog, to be compared on the next emulator run:

- **Speed — cause found:** on Hermes every `toLocaleString`, `localeCompare` and `Intl.*` call crosses a slow
  bridge to the system; money formatting (every amount on every row), sorting of operations, day headers and
  the currency list ran them hundreds of times per screen; the currency sheet also sat inside a ScrollView,
  which drew all ~160 rows. Replaced by plain arithmetic and built-in tables (checked against the platform on
  960k cases), hooks subscribe to their part of the ledger, lists are virtualized. `[perf]` timings go to the
  system log and the emulator test keeps them in `perf.txt`.
- Swipe: the next period/tab slides in only once drawn; no old content flashing back.
- Account form, switches, "Select type" sheet, "Customize icon", icon page (5×64 dp grid, virtualized), colour
  page (owner's choice: our wheel kept; one row of shades that fits the width; HEX with a fixed "#").
- Lock screen: fingerprint key bottom left (prompt once per lock, then on the key).
- Navigation filled icons and 3×3 "More"; FAB "+ Add"; selection icons; category tiles; donut; editor date
  "Today/Yesterday"; "Click on the value to edit"; Additionally cards; Change categories segmented tabs.

## Functional pass (2026-11-13, brief "complete, responsive, functionally faithful migration")

Built from the first application's code, each checked against its own results (parity fixtures written
by `test/parity/run-old.mjs`): Data section (menu, saved backups in the database with the daily copy,
restore page with merge/replace and the three ways for scheduled payments, data file page with Share and
Save to a folder, deletion page with its four ways and safeguards), CSV import wizard (columns, date order,
decimal point, UTF-8 / Windows-1251 / UTF-16, links, preview, list of left-out rows, undo, example and
template), export page (financial summary PDF, detailed transactions PDF, CSV; preview drawn from the
same commands as the PDF), recovery screen (unreadable data: copy, newest whole backup, data file, start
empty with the file put aside), first-start screen, Settings › Backups and Test notification.

Printing, photos of operations and the privacy screen ("Hide preview") need native code that no installed
package offers, and packages cannot be installed here; they are written as the application's own module
`mobile/modules/monivra-native` (Kotlin: FLAG_SECURE, PrintManager, camera intent with a FileProvider,
shrinking with BitmapFactory), linked by Expo autolinking.

## Not yet in the new application (next priorities)

1. Emulator comparison of every screen of the brief with the old crawl (`tools/tour/crawl-old.mjs`) — the
   tour of `scripts/emulator-smoke.sh` now covers the Data section and every Settings page.
2. **Local module `monivra-native`**: root cause found 2026-11-13 — `mobile/.gitignore` had `android/`, which
   also hid `modules/monivra-native/android/`, so CI never received the Kotlin code. Now `/android/` only.
   Check in the next build: "Using expo modules" lists `monivra-native`, the Kotlin compiles (first time it is
   built in CI — fix compile errors if any), then verify clip/photo menu (16c), Print and the privacy screen.
2a. Long press after swipes: measured on emulator — after a swipe the row's measured x was -395 while the
   touch was at 206 (stale layout after the native-driven pager animation), so Pressable cancelled the press.
   Rows now use `pressRetentionOffset={WIDE_RETENTION}` (`ui/pager.tsx`); logs removed. Confirm in the next
   build's steps.txt ("long press after swipes" must say working).
2b. Owner's list of 2026-11-13 (film `1000033195/6`, photo of the lock screen): done in code, to be compared
   on screenshots of the next build — no fill on plain touch (accounts, categories, operations; only the long
   press selects), selection look (pink full-width row, accent square with a tick), lock screen (big keys, grey
   dots, dollar sign, new fingerprint icon), wallet tab icon filled, About page picture/text, fee help and
   reminder help dialogs, bulk edit rebuilt (clear crosses, comment dialog, transfer role, tags add/remove).
   Still to do from the film: bottom-bar fill animation timing check, "Select operations" bar details.
   Text parity: `scratchpad` check listed ~190 old strings absent from the new source; most are browser-only
   or accessibility labels; the real explanations were restored (calculation, reminder, bulk edit).
3. Device checks on the owner's phone; background posting delays measured on two vendors (PoC P3).


## Проверено на эмуляторе (сборка 48, CI 43416326940)
- Тестовое уведомление «Run notification» приходит плавающей шапкой (heads-up) — видно на 15n.
- Выделение операций — отдельные скруглённые карточки; долгое нажатие после свайпов работает.
- Предпросмотр отчёта открывается отдельным окном; PDF строится только при «Сохранить/Поделиться/Печать».
- Ещё не проверено глазами: экран блокировки/ПИН-анимации, FAB в запланированных платежах с данными, «О нас», сетки кнопок 2×2, подстраницы настроек, поиск.

## Сверка со старым приложением (сборка 54, CI 43434117714, тур пройден)
Сверено по скриншотам и коду, расхождения исправлены: запланированный платёж (сетка 2×2, кнопка «Добавить +»), форма бюджета, настройки и их подстраницы, «Профиль», «Инструкции», «Поддержка» (кнопка внизу), политика и условия, время по формату телефона.
Перенесено из старого: уведомление после сохранения с переходом и подсветкой строки (`ui/dialogs.tsx` notice, `ui/spotlight.tsx`, `features/reveal.ts`), порядок комиссий («Change order»), «Category currency», строки «получено» при смене валюты счёта.
Одно место для вида касания: `ui/pressable.tsx` (без заливки; только клавиши с `feedback`).
Не сверено: статистика и категории после последних правок, «Данные» (импорт/экспорт), поиск, фильтры, экран блокировки и ПИН-анимация на эмуляторе, подсветка и прокрутка к новой операции (в туре нет шага).

План проверки полноты переноса: [PARITY_PLAN.md](PARITY_PLAN.md).

## Сверка окон и пустых экранов (сборка 59, CI 43467012829, тур пройден)

- Список всех 115 окон и страниц старого приложения: `docs/architecture/PARITY_WINDOWS.md` (создаётся `node tools/parity/windows.mjs`, решения по отличиям — в `tools/parity/windows-notes.md`).
- Один компонент пустых экранов `ui/empty-state.tsx` (6 анимированных картинок, как в старом) вместо разных текстов в каждом списке; на эмуляторе проверены операции, бюджеты, платежи.
- Окна «Повтор» и «Напоминание» (счётчик со стрелками и цифровой клавиатурой, выпадающий список) приведены к старому виду и проверены на эмуляторе (шаги 15a2, 15a3).
- Зелёное информационное окно подтверждения (`confirmInfo`), платёж с прошедшей датой сразу попадает в операции, «Выберите операции» без выбора.
- Тест `test/russian.test.ts` падает, если у английского текста экрана нет русского перевода (`tools/parity/missing-russian.mjs`).
- Ещё не проверено на эмуляторе: пустые экраны счетов, категорий и статистики после замены; экран блокировки и PIN; уведомления о сохранении; баннер о добавленных платежах.

## Фото, блокировка и PIN (сборка 63, CI 43491616003, тур пройден)

- Фото к операции: скрепка → «Сделать фото / Выбрать из галереи». Принимаются только JPEG, PNG, WebP до 15 МБ; формат проверяет нативный модуль по содержимому (не по имени), коды PHOTO_FORMAT / PHOTO_SIZE / PHOTO_DAMAGED → окно «Фото не прикреплено» с объяснением (`platform/photo-rules.ts`, тест `test/photo.test.ts`). На эмуляторе проверено: текстовый файл «.jpg» и файл 17 МБ отклонены с окном, настоящее фото прикреплено, открывается на весь экран, после сохранения в строке операции значок скрепки (шаги 16d–16h).
- PIN: «Установить PIN» / «Отключить PIN» одной нижней панелью с двумя полями и цифровой клавиатурой (общий `DigitPad` с вводом числа), первый PIN включает «Блокировать при выходе». Приложение остаётся под экраном блокировки, после PIN человек на том же экране. Сообщение «Неверный PIN» показывается над экраном блокировки. Найдена и исправлена ошибка: вылет при вводе цифры PIN (два способа анимации на одной точке). На эмуляторе проверено: установка, блокировка, неверный и верный PIN, отключение (шаги 15q…).
- Не проверено на телефоне: съёмка камерой, отпечаток пальца/лицо, фото из облака (не скачанное).

## Скорость, блокировка, предпросмотр, диаграмма (сборка 70, CI 43540365476)

- Замер скорости на эмуляторе: `mobile/scripts/emulator-perf.sh` (3000 операций за 18 месяцев, обычные действия; паузы JS и медленные кадры по каждому действию), сводка `builds/<N>/perf/perf-summary.txt`. Сборка 70: вкладки 0–0,13 с, прокрутка списка без пауз > 0,13 с, сохранение операции ~1 с суммарно (паузы ≤ 0,16 с), PIN после ввода ~0,2 с. Тяжёлое: открытие файла восстановления (пауза ~6,5 с) — ускорена проверка дат, шаги размечены для следующего замера.
- PIN проверяется системным PBKDF2 (нативный модуль), последняя точка рисуется до проверки, неверный PIN встряхивает пустые точки и даёт вибрацию (`platform/haptics.ts`), клавиатура над системной панелью, логотип (сделано моделью Fable, проверено на эмуляторе).
- Предпросмотр отчёта: страницы рисует системный PdfRenderer в нативном модуле (картинки в кэше), первые 3 — за диалогом, остальные в фоне (`application/report/page-images.ts`, тест `test/page-images.test.ts`); подготовленные отчёты хранятся, пока данные и настройки те же. 148 страниц: открытие ~2,5 с на эмуляторе.
- Найдено и исправлено: с SDK 58 запись файла асинхронная — «Поделиться», «Печать», «Сохранить» и предпросмотр получали пустой/обрезанный файл.
- Диаграмма статистики: доля по углу касания (`domain/chart.ts` `sliceAt`, тесты), в центре сумма периода, если ничего не выбрано; полоски категорий цветом категории; подписи оси графика в целых единицах (были копейки).

## Свайпы, первое открытие операций, сверка разделов (сборка 82, CI 43625729911, 15.11)

- Свайп периода больше не показывает на кадр прошлый период: пейджер возвращал смещение в середину раньше, чем
  новые страницы попадали на экран (`ui/pager.tsx`: страницы на ленте, место — по числу сдвигов). Проверено
  покадрово по записи экрана эмулятора (`builds/78/emulator/19b-categories-period-swipes.mp4`, 118 кадров).
- Полоска вкладок «Счета / Итого» и название периода идут за пальцем (`ui/parts.tsx` TopTabs `followPager`).
- Первое открытие «Операций»: список виден через ~0,24 с (было 3,6 с непрерывной дорисовки по записи экрана);
  JS занят 118 мс вместо 818 (`features/operations.tsx`: окно 2 экрана, шаг 3 экрана; соседи через 700 мс).
  Остаются невидимые перерисовки ~3 с после открытия — причина не установлена (см. аудит, PERFORMANCE_ROOT_CAUSES).
- По сверке с браузерной: график статистики на весь период, плитки категорий в полях, дата копии «Nov 14, 2026,
  6:01 PM», строка отпечатка «Not set up on this phone», сноски как `.footnote`, страница подписки без заголовка,
  у «Notifications» убрано добавленное пояснение, без полос прокрутки на листаемых страницах, «Назад» выходит из
  выделения и поиска. Отличия по снимкам/видео владельца оставлены (`docs/audits/monivra-parity-performance/SECTIONS_WALK.md`).

## Скорость: причины найдены замерами (сборки 99–107, 0.3.0, 16.11)

Скоростной сценарий на эмуляторе (3000 операций), занятость JS-потока:

| Действие | 0.2.3 (95) | 0.2.4 (99) | 0.3.0 (107) |
|---|---|---|---|
| 3 свайпа периода назад | 371 мс | 1601 мс | 415 мс |
| 3 свайпа вперёд | 283 мс | 1094 мс | 174 мс |
| 2 быстрых свайпа (0,35 с) | — | второй терялся | оба приняты |

Найдено и исправлено:
- `freezeOnBlur:false` (0.2.4) — скрытые вкладки рисовались при каждом свайпе; заморозка возвращена.
- `ui-state.ts` — один объект на всё; теперь подписка по частям, пустое изменение никого не будит.
- Ручной пейджер (JS-жест, перестройка соседей) заменён на `react-native-pager-view` (ViewPager2) с длинным рядом страниц (`ui/native-pager.tsx`); соседи рисуются в `startTransition`.
- Пейджер принимает страницу только после касания пальцем и только в фокусе (скрытый пейджер сам сообщал страницы и зацикливал период со статистикой).
- Ключ страницы периода — вид + границы, а не дата-якорь.
- `Pressable`: `blockNativeResponder: false`, малая зона удержания строк — свайп больше не становится нажатием.
- Список операций — FlashList 2.3.2 с одним липким заголовком дня.
- Вкладка подсвечивается сразу, экран строится следующим кадром.

## Белые страницы при быстрых свайпах (сборки 110–114, 0.3.1, 17.11)

Замеры: эмулятор CI, 3000 операций, видео 10/30 быстрых свайпов (`scripts/blank-frames.py` — доля кадров с пустой страницей), записи пейджера в `perf.txt` (была ли нарисована страница, до которой доехал палец).

Причины (подтверждены записями):
1. `ui/native-pager.tsx`: соседи рисовались в `startTransition`; каждый новый свайп прерывал и выбрасывал эту работу, за серию свайпов она не применялась ни разу (отставание до 9–19 страниц), содержимое появлялось через 0,5–0,8 с после последнего свайпа. Теперь — обычная задача сразу после коммита свайпа (не выбрасывается, рисует вокруг последней страницы).
2. Скрытые вкладки следили за общим периодом: при свайпах в Категориях/Статистике перерисовывались страницы скрытых Операций (11–13 коммитов за 10 свайпов). Теперь `useScreenPeriod` (period-bar.tsx) — скрытый экран берёт период при показе, без анимации (`instant`).
3. Операции: запуск FlashList на новой странице — 268 мс в среднем, до 546 мс (эмулятор); расчёты страницы — единицы мс. Не исправлено, нужно решение.

Пустые кадры, до → после: Категории 55% → 11% (самая длинная пустота 4,8 → 0,33 с), Статистика 62% → 17% (3,9 → 0,4 с), Операции 30 свайпов 80% → 43% (7,2 → 1,6 с), Операции 10 свайпов 36% → 59% (5,1 → 2,5 с), смена направления 0 → 0.

Круг цвета: координаты пальца считались от элемента под пальцем (кольцо, повёрнутый квадрат) — SVG-слоям `pointerEvents="none"`.

## Клавиатура, дата новой операции, листание (сборки 117–123, 0.3.2, 21.11)

**Клавиатура.** Причина: слои (шторки, диалоги, страницы поверх экрана) рисуются внутри приложения, поле под ними сохраняло фокус, Android держал клавиатуру; `KeyboardPad` укорачивал окно — слой открывался сжатым и прокручиваемым. Решение одно на всё приложение (`ui/keyboard.tsx` `dismissKeyboard`): клавиатура уходит при открытии любого слоя (кроме слоёв для ввода: `Prompt`, комментарий массового изменения — `sheets.open(..., { keyboard: true })`), при смене страницы/вкладки (`app/_layout.tsx`), при касании пустого места (корневой ответчик только пока клавиатура видна). Окно сразу получает полную высоту — слой открывается своего размера. Без задержек по таймеру.
Эмулятор (`scripts/emulator-keyboard.sh`, сборка «до» 118 → «после» 123): «Новый счёт» → поле → «Иконка»: клавиатура оставалась (через 3 с) → закрыта за ~0,3 с, шторка целая, название сохранено; 5 повторов: над шторкой 4 из 5 → 0 из 5; уход с формы, касание пустого места — закрывается. Телефон — не проверено.

**Дата новой операции** (отличие от эталона по просьбе владельца): прошлый период — его день, ближайший к сегодня (выбранный день; последний день прошлого месяца/недели); текущий и будущий период, «Счета», «Всё время» — сегодня (`domain/periods.ts` `dateForNewOperation`, тест `test/new-operation-date.test.ts`). Эмулятор: расход на прошлом месяце записан 31 октября.

**Листание** (`scripts/emulator-paging.sh`, профили «обычный» и «слабый» — 2 ядра/2 ГБ, по 3 прогона): в обычном темпе все страницы готовы сразу на всех экранах. Быстрые свайпы в Операциях (база 119): опаздывали 12–39 % страниц, худшее 0,4–0,8 с. Операции рисуют заранее по 2 периода с каждой стороны (`PeriodPager around={2}`): сборка 123 — 0 опоздавших по месяцам/неделям/дням на обоих профилях; стресс 30 подряд на слабом — 6 из 17, до 0,6 с. Память на ~10–20 МБ больше, пока открыты Операции; размер APK +1,4 КБ. Заголовок и строки совпали в 25 из 25 проверок.

## Список владельца от 22.11 (0.3.3)

- Будущий период: новая операция получает первый день периода и попадает в запланированные; под датой это написано
  («Попадёт в запланированные платежи»). Тест `test/new-operation-date.test.ts`.
- Первое нажатие на «Расходы/Доходы» пропадало: события пейджера приходят в JS не по порядку («idle» раньше
  «settling»), флаг «листается» оставался поднятым до 1,5 с и `pagerBusy()` глотал нажатия. Теперь каждое событие
  лишь сдвигает срок (`ui/gesture-lock.ts`: 0,4 с при движении, 0,15 с после остановки). Нижняя панель жмёт по
  касанию (onPressIn) и этой блокировки не касалась.
- Статистика: открытая страница рисует выбранный тип сразу вместе с вкладкой (отложенный рисунок оставлял старый тип).
- Колесо цвета: координаты пальца считаются от угла колеса на экране (pageX/pageY минус угол, взятый при касании), а
  не locationX от того, что под пальцем; рисунки не принимают касаний. Проверка смоука `12e2` — палец за углом квадрата.
- Запланированные и бюджеты: долгое нажатие — выбор нескольких, удаление выбранных (`ui/selection.tsx`).
- Бюджет: при сохранении расхода, который превысит лимит, — вопрос (`domain/budget-check.ts`, тест).
- Новый долг: поле «Уже погашено» (общий долг = введённая сумма, счёт начинается с остатка). Значок типа долга
  показывает тип (закрашен квадрат, к которому идёт стрелка), цвет — из темы, в листе выбора крупнее.
- Первый запуск: одна кнопка «Начать» (пустые данные); долгое нажатие — базовый набор (нужно автопроверкам).
- Категории без единой категории: без переключателя сверху. Счётчик повторов — одно поле со стрелками.
- Пустые экраны: новые короткие анимации (операции 2,5 с, категории — шарики из коробки, статистика — столбики
  снизу вверх слева направо и стрелка над ними, бюджеты — монета вокруг купюры, запланированные — календарь качается).

## Список владельца от 22.11, второй заход (0.3.4)

- Анимации пустых экранов переделаны по длительностям из видео владельца (покадрово, без общего «сжатия»):
  операции — линза по ключевым точкам 0,1–4,7 с; бюджеты — записка с кольцом и четырьмя углами; запланированные —
  календарь качается с затуханием; статистика, категории, счета — по своим временам (`ui/empty-state.tsx`, `keyed`).
  Бюджеты и запланированные играют при каждом открытии, остальные — один раз за запуск (`REPLAYS`).
  Эмулятор показывает только конечный кадр; сверка движения — на телефоне.
- Разрешение на уведомления: окно с колокольчиком показывается через некоторое время после первого запуска, только
  если система ещё не спрашивала (`platform/notification-ask.ts`, `features/notification-ask.tsx`); «Разрешить»
  включает ежедневное напоминание (20:00 по местному времени), настройки — как раньше.
- Бюджет: выбор категорий — обычный список расходов, сверху «Все категории расходов», подкатегории выбираются по одной.
- Счётчик повторов/напоминания: скруглённая рамка, ячейки со стрелками (по 1/5) и значением (3/5) с разделителями.
- Кнопки «Отмена/OK» диалогов параметров стоят по центру под «Отключить».
- «Начать» всегда создаёт базовые категории и счета; у базовых категорий есть подкатегории (`STARTER_SUBCATEGORIES`).

## Список владельца от 22.11, третий заход (0.3.5)

- **Причина «сползающих» анимаций.** Поворот и увеличение рисунка вокруг точки (`originX/originY`) на анимируемой группе
  react-native-svg не учитываются: рисунок поворачивался вокруг угла картинки и уезжал со своего места (на снимке
  сборки 129 крест оказался вне лупы). Теперь везде `Pivot` (`ui/empty-state.tsx`): три вложенные группы
  (перенос в точку, поворот/масштаб, перенос назад) — без «origin».
- **Запланированные.** Календарь качается на нижнем ребре как колокольчик: угол взят с каждого кадра видео (±10°, затем
  ±5°, ±2,5°; покой с 2 с); круг и кольцо не двигаются.
- **Бюджеты.** Купюра — лента с волнистыми длинными сторонами: контур (4 угла и изгибы сторон), овал и угловые метки
  измерены на каждом кадре видео (`ui/budget-motion.ts`, скрипты измерения — в заметках сессии). Кольцо
  одинаковой толщины, правая половина проходит за купюрой, левая — перед ней, не обрезается рамкой.
- **Диалоги «Напоминание/Повтор»** — по фото владельца: счётчик в скруглённой рамке с отдельным блоком значения,
  подписи крупнее, список и время по центру со значком, маленькая «Отключить» справа, «Отмена/OK» справа.
- Кнопки окон действий (категория, счёт, статистика) в неполном ряду по центру (`ActionGrid`).
- «Расходы/Доходы» в статистике — без цветной подсветки, как в категориях. Окно выбора категорий бюджета: «Подтвердить»
  — таблеткой, как в других диалогах.
- Смоук: серия кадров сразу после открытия «Бюджетов» и «Запланированных» (`15m-*-moving-*.png`).

## Список владельца от 22.11, четвёртый заход (0.3.6)

Проверено только типами, тестами и границами; на эмуляторе/телефоне — после сборки CI.

- **Анимации и поток JS.** Все анимации пока идут через `Animated` с `useNativeDriver: false`, то есть считаются в основном потоке JS (SVG-пути и их `d` нельзя отдать нативному драйверу). Для заставок это приемлемо и оставлено как есть. **Правильная долгосрочная замена** — анимации вне основного потока: `react-native-reanimated` (worklets на UI-потоке) или `@shopify/react-native-skia`, либо заранее отрендеренный Lottie. Не установлены: в среде нет сети для пакетов. Если на слабых телефонах заставки будут рывками — переходить на них.
- **`Pivot`** вынесен в `ui/svg-pivot.tsx` (общий для заставок и колокольчика уведомлений): поворот/масштаб группы SVG вокруг точки через три вложенные группы, без `originX/originY` (они у анимированной группы не работают).
- **Колокольчик** в диалоге разрешения уведомлений подвешен за верх: два быстрых рывка с затуханием (~14°, 10°, 5°, 2°), затем пауза.
- **Бюджеты:** за купюрой скрыта только верхняя правая четверть кольца (12–3 часа), остальное кольцо поверх (измерено по кадрам видео).
- **Операции и статистика** переписаны по измерениям нового видео (лупа: точка → скан → возврат → крестик; шесть столбцов, звезда, стрелка по дуге).
- **Циферблат времени:** координаты берутся как `pageX/pageY` минус угол циферблата (как в цветовом круге), поэтому палец за рамкой больше не сбивает стрелку.
- **«Отключить»** в диалоге запланированного платежа: таблетка того же размера, что «ОК», акцентного цвета (обводка), второстепенная.
- **Вкладки:** первые посещения тяжёлых вкладок (Статистика ~0,4 с, «Ещё» до 0,9–12 с на слабом профиле) подвисали сразу после нажатия. Теперь вкладки по одной достраиваются в фоне после запуска (`lazy` по очереди в `(tabs)/_layout.tsx`), первый показ уже готов. Пропущенное нажатие справа налево не воспроизведено; стресс-проверка быстрых нажатий — в планах.

## Список владельца от 22.11, пятый заход (0.3.7)

Проверено типами, тестами, границами; на эмуляторе/телефоне — после сборки CI.

- **Цифровая шторка** (баланс, цель, курс): заголовок убран, шторка ниже; название осталось только для чтения с экрана.
- **Поля «Повторять каждые», «Число повторов», «За сколько напомнить»** в диалогах запланированного платежа: нажатие выделяет ячейку рамкой акцентного цвета, мигает курсор, снизу открывается системная цифровая клавиатура (`keyboardType="numeric"`). Курсор всегда после уже стоящих цифр; если было «∞» (или не число), поле очищается. Значение сохраняется при каждой цифре, поэтому «ОК» не требует предварительной потери фокуса. Раньше открывалась наша шторка с кнопками.
- **Вкладки:** по видео владельца после нажатия на вкладку ещё какое-то время виден старый раздел (первый запуск). Причина не устранена полностью: фоновая подготовка вкладок (0.3.6) не помогла на первом запуске; решение отложено (владелец советуется с другой моделью).
- **Бюджеты (видео с телефона):** ролик снят на сборке 0.3.5, правило слоёв кольца (за купюрой только верхняя правая четверть) введено в 0.3.6; проверка на телефоне — после установки 0.3.7.

## Список владельца от 23.11 (0.3.8)

План: `docs/agent/FIX_PLAN_0.3.8.md`. Проверено типами, тестами (110), границами слоёв; рисунок бюджетов сверен с кадрами записи отдельной программой (см. ниже); на эмуляторе и телефоне — по результатам CI (дописывается ниже).

- **P0-1, предсборка вкладок:** причина — фоновая сборка вкладок (0.3.6) целиком блокирует поток JS ровно в секунды после запуска (первое «Ещё» 1,3–2,8 с против 40–160 мс до неё, сборки 129–132). Исправление: предсборка удалена, обычное ленивое монтирование; `freezeOnBlur` оставлен.
- **P0-2, пропущенное нажатие:** причина — таймер 1,5 с переписывал «куда нажато» на старую вкладку, и следующее нажатие на неё (возврат) считалось «уже нажато». Исправление (`ui/tab-bar.tsx`): нажатие отбрасывается, только если вкладка и запрошена, и показана; таймер удалён; «куда нажато» берётся из навигатора только когда нет более нового запроса; пилюля снимается, когда навигатор дошёл до нажатой вкладки. Строки `perfNote` сохранены.
- **P0-3, анимации пустых экранов:** причина — анимация шла с монтирования и продолжалась за ушедшей вкладкой (JS-драйвер, поток занят, пока строится следующая вкладка). Исправление (`ui/empty-state.tsx`): старт только в фокусе и после двух кадров, на уходе остановка и поза покоя; правило повтора — картинка играет с нуля при каждом визите, пока человек ничего не сделал за этот запуск (`ui/quiet.ts`: `setView` при применённом изменении и `useCommand` вызывают `markActed`; страницы, сами ставящие период/фильтр при открытии и возвращающие при закрытии — `filtered`, `export-page`, `budgets` — передают `byPerson = false`). `firstShown`/`REPLAYS` удалены. Тест — только на сам флаг (`test/quiet.test.ts`); связка `setView` → `markActed` без react в этой среде не запускалась.
- **P0-4, проверка CI на случай владельца:** в `scripts/emulator-perf.sh` сразу после «first screen» (профиль пуст) три хода: Счета → Статистика → Счета (0,3 с), Категории → Операции → Категории (0,3 с), 12 нажатий в случайном порядке через 0,25–0,5 с (зерно 2311); координаты берутся один раз. `perf-summary.py` печатает по каждому ходу число нажатий, отброшенных нажатий, p50/p90 «нажатие → показано» и паузы JS. Скрипт проверен `bash -n`, сводка — на выдуманном журнале; на эмуляторе — по CI.
- **P1-1, кольцо бюджетов:** причина — купюра была залита цветом экрана и стирала заднюю четверть кольца. Исправление: контур купюры без заливки; порядок — задняя дуга (268°→7°), купюра, передняя дуга (5°→270°), торцы плоские.
- **P1-2, купюра как одно тело:** причина — четыре свободных диска у углов и отдельно отслеживаемый эллипс не следовали за краями. Исправление: рамка — штрих по замкнутой линии (два кубических длинных края, два прямых коротких), подогнанной к кадрам записи по внешней границе (`scripts/gen-budget-motion.py`, там же описание); четыре полудиска строятся из самих краёв (параметр и радиус измерены на кадре покоя: 0,93/0,79/0,93/0,79, радиус 25), эллипс — от середины купюры и направления её средней линии; кадры с кривой, где край перегибается (радиус < 50 px), заменены интерполяцией формы, всё сглажено по времени (Савицкий–Голей, 7 кадров), 89 кадров вместо 37. Сверка вне приложения (Python-растеризатор тех же строк против кадров записи): на кадре покоя совпадение зелёного 0,89 (IoU), средняя ошибка границы по кадрам 1,7 px записи; на кадрах 74–80 (кольцо закрывает левый конец) изгиб в модели положе, чем в записи. В самом приложении и на эмуляторе — по CI.
- **P1-3, числовые поля запланированного платежа:** причина — значение по умолчанию было настоящим текстом (набор давал «05»), «∞» исчезало с задержкой в один кадр. Исправление (`features/editor/options.tsx`): значение по умолчанию — подсказка (`placeholder` цвета текста, при вводе — приглушённая); при фокусе текст не меняется; введённое число остаётся текстом, курсор в конце ставится один раз при фокусе; ведущие нули убираются; пустое = по умолчанию. Не проверено на устройстве.
- **P1-4, календарь «встряхнуть»:** календарь вращается вокруг своего центра двумя затухающими всплесками (12°, −11°, 9°… по 70 мс на полуразмах, пауза, второй всплеск ~60 %), сдвиг ±3 px в фазе, всего 1,4 с, нативный драйвер. Скорость подбирается вместе с владельцем.
- **P2-1 (только календарь и колокольчик):** календарь и колокольчик (уведомления) — `Animated.View` с `transformOrigin` и `useNativeDriver: true` (колокольчик вокруг подвеса, язычок во вложенном слое). Остальные картинки остаются на JS-драйвере; бумага операций не перерисовывалась.

## Разбор сборки 133 (0.3.9)

Сборка 133 (0.3.8, CI 45063706551) прошла; по её журналам и снимкам найдено и исправлено:

- **Вкладки, ключи маршрутов:** в журнале нажатий у второго из двух быстрых нажатий ключ «запрошенной» вкладки отсутствовал в `state.routes` (4 из 57 строк, `asked undefined`). Панель теперь хранит запрошенную и нажатую вкладки по имени (`ui/tab-bar.tsx`), иначе пилюля могла остаться без вкладки. Итоговые выбранные вкладки во всех ходах 133 были верны.
- **Картинки пустых экранов:** правило «после действия человека всё в покое» означало, что экран, ещё не открытый в этом запуске, не играл вообще. Теперь каждый экран играет при первом посещении в запуске (набор `played` в `ui/quiet.ts`, `shouldPlay`/`markPlayed`); до первого действия играет при каждом посещении, после — только ещё не виденные. Исключение для сборки скорости (в 0.3.8 второй коммит) убрано: CI работает так же, как телефон. Тест — `test/quiet.test.ts`.
- **Остановка картинки при нажатии на вкладку:** в 133 при 12 быстрых нажатиях картинка уходящей вкладки работала до её размонтирования, то есть пока строилась новая (нажатие → показано до 1,5 с, JS занят 9,2 с). `ui/picture-stop.ts`: нажатие на вкладку сразу останавливает все картинки (и отменяет ожидающие кадры/таймер); запуск картинки — через два кадра и 150 мс после фокуса.
- **Кольцо бюджетов, разрез по кадрам:** фиксированный разрез на 270°/5° обрезал край купюры ступенькой, где обводка пересекала кольцо у этих углов. Теперь `scripts/gen-budget-motion.py` для каждого кадра кольца находит участки, где штрих кольца касается линии купюры (расстояние < (23+25)/2+2 px, шаг 1°), делит их на «за купюрой» (середина в 225°…45°) и «перед», режет кольцо в свободных промежутках между штрихами, сглаживает углы разреза медианой по 5 кадрам (угол внутри участка наложения возвращается к сырому) и пишет `RING_BACK`/`RING_FRONT` (по две дуги ≤ 180°, одинаковая структура команд). Заодно плоская сторона полудисков заглублена на 2 px под штрих (на кадрах была волосяная щель). Проверено отрисовкой всех 55 кадров кольца в Chromium (Playwright): ступенек на кадрах 1300, 1533, 1800, 1967 нет; листы лежат в рабочей папке сессии, не в репозитории.
- **Не достигнуто в 0.3.8 и не проверено в 0.3.9:** p90 «нажатие → показано» на пустом профиле в 133 — 583/300/389 мс (цель < 200 мс), потерянных нажатий 0; картинки операций, счетов, категорий и статистики остаются на JS-драйвере.

## Разбор сборки 134 и записи v17 (0.3.10)

Проверено типами, тестами (110), границами слоёв. Рисунки сверены с кадрами записей первого приложения; на телефоне и эмуляторе — после сборки CI.

- **Нижняя панель:** ключ вкладки теперь берётся из свежего состояния навигатора в кадре перехода (по имени вкладки); если за это время пришло новое нажатие, старый переход пропускается; смена ключа у вкладки с тем же именем пишется в журнал скорости.
- **Бюджеты, купюра непрозрачна:** обвод купюры залит цветом экрана; порядок: задняя дуга кольца, купюра, отметки, передняя дуга. Кольцо за купюрой скрывает сама купюра, а не фиксированный разрез.
- **Бюджеты, разрез кольца по самой записи:** для каждой строки кольца по кадру записи считается, какие углы кольца закрыты зелёным (задняя дуга) и какие видны поверх купюры (передняя); концы дуг стоят посередине свободных участков, короткие (< 8°) закрытые участки разрезом не считаются. Кадры без чистого разреза пишутся в журнал генератора (концы дуги тогда стоят на самой купюре, без нахлёста).
- **Бюджеты, контур:** каждый длинный край — две кубические кривые с общей касательной в свободном стыке, короткие края прямые; подгонка к видимой границе зелёного в обе стороны (расстояние от нашей границы до записи и от записи до нашей). Принято по таблице генератора: среднее ≤ 1,5 px и p95 ≤ 3 px на каждом из 89 записанных кадров.
- **Бюджеты, выпуклости:** полудиск плюс полоса от его хорды до осевой линии обводки; эллипс повторяет новую подгонку.
- **Операции, лист обведён по записи v17:** `scripts/trace-operations-paper.py` вырезает тёмный лист (обвод, верхний завиток, нижний свиток) из последнего кадра записи, подгоняет кубические Безье с ошибкой ≤ 0,75 px и пишет `src/ui/operations-paper.ts`; четыре светлые строки измерены заново. Цвета темы не менялись. Совпадение с кадром 1:1: заливка IoU 0,985 (≥ 0,97), обвод IoU 0,917 (≥ 0,90).
- **Операции, лупа:** центр и поворот лупы измерены по каждому кадру записи (отсчёт от первого кадра ролика); прежняя таблица расходилась до 16° по повороту и до 24 px в первых кадрах. Поворот взят по крестику (ручку закрывает лист); таблица LENS, масштаб лупы и роста крестика пересчитаны (ошибка по кадрам ≤ 0,6 px, ≤ 0,5°).
- **Операции, строки текста:** время прорисовки четырёх строк измерено по кадрам записи (первые две рисуются вместе, третья и четвёртая позже с шагом около 67 мс; прежние ключи расходились до 49 px); не начатая строка скрыта, чтобы круглый конец не рисовался точкой.

## Лист «Операций» из прямых линий (0.3.11)

Проверено типами, тестами (110), границами слоёв. В сборке 136 заливки листа (завиток и свиток) были хороши, а обвод, обведённый по кадру записи, дрожал (шум сжатия видео): левый край выгибался, средний штрих был похож на линзу, верхняя линия и правый край шли волной, ширина менялась.

- **Обвод — штрихи, а не контур:** `scripts/trace-operations-paper.py` теперь измеряет линии целиком (медиана по строкам или столбцам взвешенного по темноте центра и суммы темноты) и пишет прямые штрихи с круглыми концами: левый край тремя частями, четверть окружности радиуса 50,3 в левом верхнем углу (по краю штриха, отклонение 0,3 px), верхняя линия, правый край. Концы, упирающиеся в заливку, заходят в неё.
- **Ширина:** в записи она разная и измерена: левый край 5,7 (нижняя часть и штрих 6,7), верхняя линия 5,0, правый край 9,1. Каждая линия получила свою постоянную ширину (угол берёт среднее), поэтому обвод — несколько путей.
- **Заливки:** только завиток и свиток; прямые участки (горизонтальные и вертикальные, как в рисунке) записаны отрезками, остальное кубическими Безье с ошибкой до 0,5 px; верх свитка — прямая, подогнанная по краю.
- **Полпикселя:** центры из индексов пикселей теперь в координатах рисунка (+0,5); раньше весь лист был сдвинут на полпикселя.
- **Проверка:** отрисовка в Chromium 1:1 против кадра f_200 на уровне половинной яркости: обвод IoU 0,938, заливки 0,979.
