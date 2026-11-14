# Ветки GitHub: инвентаризация (ничего не удалено, не слито, не переименовано)

Состояние на 14.11.2026. Ветки принадлежат **каждому репозиторию отдельно**: ветки с одинаковым именем в разных
репозиториях друг от друга не зависят. Удаление ветки не удаляет коммиты сразу, но коммиты, на которые больше
ничего не ссылается, GitHub со временем может убрать, а чужие клоны и ссылки на ветку перестанут работать —
риск не нулевой.

## Какие репозитории видны

Под учётной записью `Maytema` этой сессии видны три репозитория (список `list_repos`):

| Репозиторий | Доступ в этой сессии | Ветка по умолчанию |
|---|---|---|
| `Maytema/Monivra` | полный (чтение API, push) | `main` |
| `Maytema/Impulse-store` (приватный) | только чтение (подключён для этой проверки) | `main` |
| `Maytema/ProfiDez` (публичный) | чтение `git ls-remote` (API закрыт для сессии) | `main` |

Других репозиториев учётной записи сессия не видит: проверить «весь аккаунт» сверх этого списка нельзя.

## Maytema/Monivra (30 веток)

Правил защиты нет ни у одной ветки (`main` → «Branch not protected»). Тегов нет. Открыт один PR: **#9**
`docs/payments-budgets-plan → main`. Слияние проверено по достижимости (`git merge-base --is-ancestor`), а не
по отметке GitHub.

Зависимости в автоматизации:
- `.github/workflows/pages.yml` — сайт собирается из **`main`**.
- `.github/workflows/android.yml` — запуск при push в **`android-first-apk`**, результаты пишет в **`android-builds`**.
- `.github/workflows/mobile.yml` — запуск при push в **`rn-migration`**, APK и скриншоты пишет в **`mobile-builds`**.
- `.github/workflows/audit.yml` (ветка аудита) — запуск при push в **`audit/parity-performance`**, результаты в
  **`audit-results`** (появится после первого прогона).

| Ветка | Вершина | Уник. коммитов (нет в `main`) | В `main`? | В `rn-migration`? | Дата | Решение |
|---|---|---|---|---|---|---|
| `main` | 98f4575 | 0 | — | да | 10.11 | **KEEP** (сайт) |
| `updates` | 98f4575 | 0 (= main) | да | да | 10.11 | **KEEP** (роль «мелкие обновления», см. `docs/BRANCH_CLEANUP_PROPOSAL_RU.md`) |
| `rn-migration` | 06360df | 199 | нет | — | 14.11 | **KEEP** (текущая работа, CI) |
| `mobile-builds` | d894942 | 58 (только результаты сборок) | нет | нет | 14.11 | **KEEP** (пишет `mobile.yml`) |
| `android-first-apk` | 298406b | 36 | нет | **да** (целиком внутри `rn-migration`) | 11.11 | **KEEP** пока на неё смотрит `android.yml` (старое приложение) |
| `android-builds` | fa0f515 | 43 (результаты старых сборок) | нет | нет | 11.11 | **KEEP** пока пишет `android.yml`; это единственное место с APK старой версии на сервере |
| `docs/react-native-architecture` | d74abfc | 37 | нет | **да** | 11.11 | **SAFE DELETE CANDIDATE** (всё есть в `rn-migration`; нет PR и ссылок в workflow) |
| `audit/parity-performance` | (эта работа) | — | нет | нет | 14.11 | **KEEP** до решения по аудиту |
| `docs/payments-budgets-plan` | 3e93831 | **1** | нет | нет | 02.11 | **MANUAL REVIEW**: открыт PR #9, коммит нигде больше нет |
| `experiments` | 04d7030 | **1** | нет | нет | 03.11 | **MANUAL REVIEW**: уникальный коммит «Density…», нигде больше нет |
| `backup-before-cleanup` | 39daf07 | 0 | да | да | 26.10 | **SAFE DELETE CANDIDATE** |
| `cleanup` | 79466e6 | 0 | да | да | 30.10 | **SAFE DELETE CANDIDATE** |
| `docs/where-to-look` | 253c433 | 0 | да | да | 02.11 | **SAFE DELETE CANDIDATE** |
| `feat/auto-post-due` | 2ec8a27 | 0 | да | да | 02.11 | **SAFE DELETE CANDIDATE** |
| `feat/budget-details` | ea2f471 | 0 | да | да | 02.11 | **SAFE DELETE CANDIDATE** |
| `feat/budget-header-add` | 091e55c | 0 | да | да | 02.11 | **SAFE DELETE CANDIDATE** |
| `feat/budget-period` | d00a067 | 0 | да | да | 02.11 | **SAFE DELETE CANDIDATE** |
| `feat/due-payments` | b55a534 | 0 | да | да | 02.11 | **SAFE DELETE CANDIDATE** |
| `feat/notice-targets` | 2fb6b96 | 0 | да | да | 02.11 | **SAFE DELETE CANDIDATE** |
| `feat/original-parity` | 935279a | 0 | да | да | 02.11 | **SAFE DELETE CANDIDATE** |
| `feat/page-swipe-fab` | 9bbdbb0 | 0 | да | да | 02.11 | **SAFE DELETE CANDIDATE** |
| `feat/parity-export-deletion-empty` | 71a8529 | 0 | да | да | 02.11 | **SAFE DELETE CANDIDATE** |
| `feat/saved-notice` | 0d50d96 | 0 | да | да | 02.11 | **SAFE DELETE CANDIDATE** |
| `feat/schedule-rules` | 793fb14 | 0 | да | да | 02.11 | **SAFE DELETE CANDIDATE** |
| `feat/scheduled-flow-preview` | 515af2c | 0 | да | да | 02.11 | **SAFE DELETE CANDIDATE** |
| `fix/cents-and-option-rows` | eda6dd7 | 0 | да | да | 02.11 | **SAFE DELETE CANDIDATE** |
| `fix/multi-select-sheet` | 416cc67 | 0 | да | да | 02.11 | **SAFE DELETE CANDIDATE** |
| `fix/pages-deploy` | 5bf5d48 | 0 | да | да | 02.11 | **SAFE DELETE CANDIDATE** |
| `fix/sheet-footer-layout` | 754cb35 | 0 | да | да | 02.11 | **SAFE DELETE CANDIDATE** |
| `refactor/architecture-cleanup` | c865e7d | 0 | да | да | 02.11 | **SAFE DELETE CANDIDATE** |

Итого: KEEP 8, SAFE DELETE CANDIDATES 19 (18 целиком в `main`, 1 целиком в `rn-migration`), MANUAL REVIEW 2.

Это совпадает с предложением от 10.11 (`docs/BRANCH_CLEANUP_PROPOSAL_RU.md`), с тремя изменениями: с тех пор
появились `rn-migration`, `mobile-builds` и `docs/react-native-architecture` (последняя теперь целиком внутри
`rn-migration`), и ветка `test` из того плана так и не создана.

### Команды для вашего решения (не выполнены)

Перед удалением — архив всех веток (восстановить можно любую):
```
git clone --mirror https://github.com/Maytema/Monivra.git monivra-mirror.git
git -C monivra-mirror.git bundle create ../monivra-all-branches-$(date +%F).bundle --all
```
Удаление 19 кандидатов одной командой (только после вашего «да»):
```
git push origin --delete backup-before-cleanup cleanup docs/where-to-look docs/react-native-architecture \
  feat/auto-post-due feat/budget-details feat/budget-header-add feat/budget-period feat/due-payments \
  feat/notice-targets feat/original-parity feat/page-swipe-fab feat/parity-export-deletion-empty \
  feat/saved-notice feat/schedule-rules feat/scheduled-flow-preview fix/cents-and-option-rows \
  fix/multi-select-sheet fix/pages-deploy fix/sheet-footer-layout refactor/architecture-cleanup
```
Для `docs/payments-budgets-plan` и `experiments` сначала решить: перенести коммит (cherry-pick) или оставить
только в архиве. PR #9 закрывается вручную.

## Maytema/Impulse-store (9 веток)

Защиты веток нет (правила недоступны на бесплатном тарифе для приватного репозитория). Открытых PR нет.
Тегов нет. Автообновление (`updater/Updater.gs`) берёт код из ветки **`main`** по умолчанию, но разрешает
указать другую ветку в свойстве `GITHUB_REF` — значит, ветки `versions/*` могут использоваться для отката.

| Ветка | Вершина | Сравнение с `main` | Последний коммит | Решение |
|---|---|---|---|---|
| `main` | 97a999a | — | 30.10 «IMPULSE 7.9.0» | **KEEP** |
| `versions/7.9.1` | 02c847a | **впереди на 1** (не слита) | 14.11 «7.9.1: report workbook (.xlsx) and colour picker» | **MANUAL REVIEW**: свежая работа, её нет в `main` |
| `versions/7.9.0` | 97a999a | совпадает с `main` | 30.10 | **KEEP** (якорь версии для отката) |
| `versions/7.8.11` … `versions/7.8.7` | 8a1eb93 … 5d3a95a | целиком в `main` (отстают на 1–5) | 24–25.10 | **KEEP** (якоря версий; удалять только если откат через `GITHUB_REF` не нужен) |
| `versions/7.8.6` | 2681ab6 | **расходится**: 1 свой коммит, отстаёт на 12 | 24.10 «review build, kept for reference» | **MANUAL REVIEW** (коммит нигде больше нет) |

## Maytema/ProfiDez

Одна ветка `main` (a2b98b1). Действий не требуется.

## Простая политика веток (предложение)

- `main` — стабильная ветка (из неё собирается сайт). Прямые коммиты в неё — только через PR.
- Одна рабочая ветка интеграции, пока идёт переход на React Native (сейчас `rn-migration`). Когда она станет
  основной, её сливают в `main`, а не держат вечно.
- Короткие ветки `fix/…` и `feat/…` — только когда нужна изоляция или проверка, и удаляются после слияния.
- Ветки результатов сборок (`android-builds`, `mobile-builds`, `audit-results`) — служебные, на них смотрит CI.
  Их можно заменить хранилищем Artifacts/Releases, но это отдельное решение.
- Версии фиксировать **тегами** (например, `v0.2.0-build.75`), а не постоянными ветками на каждую сборку.
- Для `main` включить защиту (запрет force-push и удаления) — это меняет настройки репозитория, нужно ваше «да».
