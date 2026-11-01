# Monivra

Offline personal finance tracker: accounts, categories, operations, statistics, budgets and
scheduled payments. Plain HTML, CSS and JavaScript (ES modules): no build step, no runtime
dependencies. Everything is stored on the device in `localStorage`.

Приложение для учёта личных финансов. Работает офлайн, без сборки и зависимостей;
данные хранятся на устройстве.

## Run

ES modules need a web server (opening `index.html` from the file system does not work).

- Locally: `python3 -m http.server 8000`, then open <http://localhost:8000>.
- GitHub Pages: _Deploy from a branch_ → `main` / `/ (root)`.

## Check

```
npm install        # eslint, prettier and playwright, only for checking
npm test           # in-page checks + user scenarios in a phone-sized browser
npm run lint
npm run format:check
```

## Documents

| Document                                                     | What it is                                              |
| ------------------------------------------------------------ | ------------------------------------------------------- |
| [AGENTS.md](AGENTS.md)                                       | Rules of the work and where to start, for an agent      |
| [WHERE_TO_LOOK.md](WHERE_TO_LOOK.md)                         | A screen, a look or a symptom → the file to open        |
| [ARCHITECTURE.md](ARCHITECTURE.md)                           | Layers, how a screen is drawn, where data lives         |
| [MODULES.md](MODULES.md)                                     | What every folder and module is for                     |
| [DEVELOPMENT.md](DEVELOPMENT.md)                             | Conventions, how to add a screen, a language, a check   |
| [PAYMENTS_AND_BUDGETS_PLAN.md](PAYMENTS_AND_BUDGETS_PLAN.md) | Proposed work on scheduled payments and budgets         |
| [REFACTOR_REPORT.md](REFACTOR_REPORT.md)                     | What the architecture clean-up changed and what is left |
| [tools/visual-regression](tools/visual-regression/README.md) | Screenshot comparison of every screen state             |
