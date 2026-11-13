# Monivra

Offline personal finance tracker: accounts, categories, operations, statistics, budgets and
scheduled payments.

Two applications live here: the **first application** in the repository root — plain HTML, CSS and
JavaScript (ES modules), no build step, data in `localStorage`, Android through Capacitor (`android-app/`) —
and the **new application** in [`mobile/`](mobile/README.md), React Native + Expo, which is being brought to
the same functionality and look. The first one is the reference until the new one passes acceptance.

Приложение для учёта личных финансов. Работает офлайн, без сборки и зависимостей;
данные хранятся на устройстве.

## Run the first application

ES modules need a web server (opening `index.html` from the file system does not work).

- Locally: `python3 -m http.server 8000`, then open <http://localhost:8000>.
- GitHub Pages: _Deploy from a branch_ → `main` / `/ (root)`.

## Check the first application

```
npm install        # eslint, prettier and playwright, only for checking
npm test           # in-page checks + user scenarios in a phone-sized browser
npm run lint
npm run format:check
```

## Documents

Start with [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md), which lead to the rules in
[docs/AGENTS.md](docs/AGENTS.md).

| Document | What it is |
| -------- | ---------- |
| [docs/AGENTS.md](docs/AGENTS.md) | Rules of the work, workflow, where each subject is documented |
| [docs/PROJECT_MAP.md](docs/PROJECT_MAP.md) | New application: feature → files → tests |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | New application: how it is built |
| [docs/FINANCIAL_RULES.md](docs/FINANCIAL_RULES.md) | Money rules and their evidence |
| [docs/TESTING.md](docs/TESTING.md), [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Checks, debugging, setup, conventions |
| [docs/legacy/](docs/legacy/README.md) | Guides of the first application (map, architecture, layout rules) |
| [docs/DATA_SECTION.md](docs/DATA_SECTION.md), [docs/EXPORT_RULES.md](docs/EXPORT_RULES.md) | Backups, restore, import, export |
| [tools/visual-regression](tools/visual-regression/README.md) | Screenshot comparison of every screen state of the first application |
