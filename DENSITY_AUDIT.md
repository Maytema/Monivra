# Density audit

Why some sheets and cards took more room than their content needs, what was changed, and the rules
that keep it that way. See `LAYOUT_RULES.md` for the general layout rules.

## What took the room

| Place                                                       | Cause                                                                                                                                     |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Account and category sheets (`accounts.css`)                | 24px title next to a 48px badge and a 26px star with 6px padding made the name wrap to two lines; 26px amounts; 22px gaps between tile rows; 56px tiles |
| Two figures of a card with a limit                          | They always stacked, because the grid needed 140px per figure and the card was only just narrower than two of them                       |
| Forms: `.field` in `components.css` (account, category, budget editors) | 22px padding, 24px between cards, 18px between label and input; the account editor kept its own 69px minimum height          |
| Budget card (`scheduled.css`)                               | Title, category icons, spent, meter and what is left each had a line of their own, with 8px between lines                                 |

There is no token system for spacing; sizes are written where they are used. Nothing was added on
top of that: the values were changed where they are defined.

## What was changed

- **Sheets of accounts and categories:** title 20px, badge 40px, amounts 22px, action tiles 48px
  with 24px icons and 14px labels, 14px between tile rows, tighter card padding. The star is drawn
  at 22px and keeps a 44px touch area; the negative margin gives the room back.
- **Forms (`.field`):** padding 16px (14px on very small screens), 14px between cards, 10px between
  label and input; the account editor cards 58px minimum instead of 69px.
- **Budgets:** the title and the categories it counts share a line, spent and what is left share
  the next one, the meter is last.

## Measured (360px wide screen, demo data)

| Screen                         | Before | After  |
| ------------------------------ | ------ | ------ |
| Sheet of a regular account     | 451 px | 348 px |
| Sheet of an account with limit | 593 px | 420 px |
| Sheet of a savings account     | 547 px | 436 px |
| Sheet of a debt                | 539 px | 436 px |
| Budget card                    | 165 px | 102 px |
| All budgets of a month         | 1306 px | 943 px |
| First four fields of an account editor | 425 px | 384 px |

## Checked

Small phone (320px) with a 30% larger system font, 360px in English and Russian, very long account
names (they wrap, nothing is cut or overlaps), the sheets scroll when they do not fit. A scenario
keeps the sheet below 62% of the screen, the star and every action at 44px or more and the tiles at
48px or more.

## Rules

1. A touch target is at least 44px in both directions, whatever the icon looks like. Make the
   icon smaller, not the button; pull the extra room back with a negative margin.
2. Two short figures sit side by side when they fit; never stack them by default.
3. A title and the small things that describe it (icons, hints) share a line before they get one
   each.
4. Space between cards is 14px, inside a card 12–16px, between a label and its input 10px.
5. Change a size where it is defined (the component rule), then look at every screen that uses
   it: the account sheet, the category sheet, the budget, category and account editors.

## Not changed on purpose

Rows of lists (70px, comfortable and consistent), the calculator keys, the navigation bar, the
operation editor, the colours and the shapes.
