# Предложение по очистке веток (ничего не удалено и не переименовано)

Состояние на 10.11.2026, все ветки на сервере (GitHub), всего 26. Правил защиты нет ни у одной
(`protected: false`). Открыт один PR: №9. PR №1–8 и 10–30 закрыты.

## Что нужно сохранить до любых действий
- **Архив** (git bundle всех веток, 44 МБ, проверен восстановлением): `monivra-all-branches-2026-11-10.bundle`,
  SHA-256 `d3990bf4eeafe9755ab113929fbf4707db3c804ed51dfc601c3c4a0347bd8e3a`.
  Восстановление: `git clone monivra-all-branches-2026-11-10.bundle monivra-restored`.
- **APK build 11**, который вы ставили: `monivra-0.1.0-build.11.apk`,
  SHA-256 `258a44232547f7b2c8aac63d5dadd329e2d813c5c0571b7413b79bab65a818e5` (достан из архива, хэш совпал).
- Оба файла лежат только у вас. На сервере их не публикуем. Держите две копии вне телефона.
- Старый ключ подписи тоже внутри архива (в истории). Архив храните приватно.

## Зависимости, которые нельзя сломать
- Сайт: `.github/workflows/pages.yml` собирает `main` (ветки `test` и `updates` сайт не трогают).
- Сборка Android: `.github/workflows/android.yml` запускается при пуше в **`android-first-apk`** и пишет
  результаты в **`android-builds`**. При переносе нужно поменять оба имени в workflow и в
  `android-app/scripts/publish-build.sh`.
- `updates` совпадает с `main` (98f4575), по ней шли PR №10–30 в `main`. Перезаписывать её не предлагается.

## Предложение для каждой ветки (всё требует вашего решения)

| Ветка | Уникальные коммиты | Предложение |
|---|---|---|
| `main` | — | **KEEP** без изменений |
| `updates` | 0 (= main) | **KEEP**. Роль «мелкие обновления и исправления» |
| `android-first-apk` | 18 коммитов (Android, тесты, CI) | **MIGRATE → `test`**: создать `test` из вершины, поменять триггер и имя в workflow, потом удалить старое имя |
| `android-builds` | 21 коммит с APK и отчётами | **ARCHIVE → DELETE** только после того, как CI перестанет писать в неё (результат уйдёт в «Artifacts» workflow со сроком хранения, APK только при ключе владельца) |
| `experiments` | 1 (уплотнение интерфейса, `DENSITY_AUDIT.md`) | **ARCHIVE**, решение за вами: перенести коммит в `test` или оставить только в архиве |
| `docs/payments-budgets-plan` | 1 (план платежей и бюджетов), открыт PR №9 | **MIGRATE → `test`** (документ), закрыть PR №9, ветку удалить |
| `backup-before-cleanup` | 0 (целиком в `main`) | **ARCHIVE → DELETE** |
| `cleanup` | 0 (целиком в `main`) | **ARCHIVE → DELETE** |
| `docs/where-to-look` | 0 | **ARCHIVE → DELETE** |
| `feat/auto-post-due`, `feat/budget-details`, `feat/budget-header-add`, `feat/budget-period`, `feat/due-payments`, `feat/notice-targets`, `feat/original-parity`, `feat/page-swipe-fab`, `feat/parity-export-deletion-empty`, `feat/saved-notice`, `feat/schedule-rules`, `feat/scheduled-flow-preview` | 0 у каждой (все в `main`) | **ARCHIVE → DELETE** |
| `fix/cents-and-option-rows`, `fix/multi-select-sheet`, `fix/pages-deploy`, `fix/sheet-footer-layout` | 0 | **ARCHIVE → DELETE** |
| `refactor/architecture-cleanup` | 0 | **ARCHIVE → DELETE** |

Итог после очистки: `main`, `test`, `updates`. Ветки `android-first-apk` и `android-builds` исчезают,
`test` содержит весь Android-код.

## Порядок (после вашего одобрения)
1. Вы подтверждаете список и соответствие (особенно `android-first-apk` → `test`, судьбу `experiments`).
2. Создаём `test`, переключаем workflow, убеждаемся, что сборка на `test` проходит.
3. Убеждаемся, что архив и APK у вас сохранены (две копии).
4. Удаляем ветки пачками, после каждой проверяем сайт и CI.
5. Проверяем, что остались только три ветки.
6. Локальные копии в этой среде удаляются так же.

Удаление ветки на GitHub можно обратить, пока знаете её последний коммит (он в архиве), но чужие клоны
и ссылки на неё сломаются.
