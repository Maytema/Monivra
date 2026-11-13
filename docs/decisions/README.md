# Decisions

One short record per decision that changes how the project is built or what it must look like, with the
reason, so nobody undoes it by accident. Newer records may replace older ones; say so in both.
Pre-migration technology choices with alternatives: [../architecture/TECHNOLOGY_DECISIONS.md](../architecture/TECHNOLOGY_DECISIONS.md).

| # | Decision | Date |
| - | -------- | ---- |
| [0001](0001-react-native-migration.md) | The application moves to React Native + Expo; the first application stays as the reference | 2026-11-11 |
| [0002](0002-which-reference-wins.md) | Behaviour from the first application, look from the owner's references | 2026-11-12 |
| [0003](0003-no-platform-formatting-in-hot-paths.md) | No platform `Intl` / `toLocaleString` / `localeCompare` in code that runs per row | 2026-11-12 |
| [0004](0004-colour-wheel-kept.md) | The colour page keeps the wheel (not the reference's grid) | 2026-11-12 |
| [0005](0005-keyboard-shortens-the-window.md) | The keyboard shortens the whole window | 2026-11-12 |
