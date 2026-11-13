# Layout rules for screens

These rules hold for every screen, sheet and dialog, existing and new. Before building a window,
open two or three screens of the same kind (a list, a form, a text page) and copy how they are made;
then compare with the screens in `catalog/` and with the owner's videos, measuring sizes, not
judging by eye. When a rule is broken in one place, fix it in the shared style, not in that screen.

## The end of a list

- After the last row there is no line and no space: nothing may suggest that the list goes on.
  `.content.flush` has no bottom padding and its last row has no bottom border (`components.css`).
- Rows have a line between them, never after the last one. Do not add a note, a hint or an
  empty block under a list unless the original has it; a line before such a note is dropped too.
- A list under a floating button keeps room for the button, and only that.

## Pages

- A page is a header, then a scrolling `.content`, then buttons that stay at the bottom in
  `.page-footer`. Buttons are never inside the scrolling content.
- Figures that explain what scrolls under them (a budget, a period) stay above the list, outside
  `.content`.
- Text pages (`.info-text`) start at the left edge of the text column, never centred. Their side
  padding is 24px, 16px for a page with wide rows (import); paragraphs are 8px apart, 16px on
  pages with explanations (`roomy`). A divider line separates a block of text from a form below it.
- Sizes of a page footer: buttons 56px high with 16px between them; the main button first, the
  second one tonal (`secondary`) or outlined. A compact button in the content is 40px (`compact`).
- Lists of rows (menu, settings, data): 62px minimum row, a line between rows, a chevron where the
  row opens a page, none where it acts at once.
- Filters in a list (export): one column of tinted rows, 64px, icon, the value as the main text
  and its detail as a second line. Chosen parts of a report are tinted rows with a check box;
  fields are outlined rows. Never two columns where the original has one.

## Buttons

- A button does what its name says. If a platform cannot do it, the button is not shown (a PDF
  cannot be shared as a file here, so the PDF has one button that opens the print dialog).
- Sharing uses the share sheet of the device with the bare media type (`text/csv`, not with a
  charset), and saves the file only where the device has no share sheet.
- Dangerous actions ask once more and say what exactly will be lost, with the counts.

## Empty states

- Every list that can be empty shows an illustration, a title, a hint and a button that creates
  the first item (`ui/empty-state.js`). The illustration plays its animation once, the first time it
  is shown, and is still when motion is reduced.
- Animations are taken from the original frame by frame: duration from the frame count and the
  frame rate of the recording, the order of the movements the same.

## Numbers

- A whole amount never has zero cents, whatever the settings say: `500`, never `500.00`.
  "Two decimal places" writes `500.50`, not `500.5`.

## Text

- New text is English in the code and Russian in `js/i18n/ru.js`; counted words use
  `translateCount` with all the forms of the language.
- A person never sees a technical message.
