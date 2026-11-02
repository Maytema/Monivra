/* Shows where a thing is: scrolls to the rows of operations and highlights them once */

// How long the highlight lasts; the animations of `.spot` in operations.css take as long.
const SPOT_MS = 2600;

// Rows are found after the next drawing; they may be missing when the list does not show them.
// A scheduled payment is highlighted together with the details under its row.
export function spotlight(ids) {
  requestAnimationFrame(() => {
    const rows = ids
      .map((id) => document.querySelector(`[data-operation="${CSS.escape(id)}"]`))
      .map((row) => row?.closest(".scheduled-item") ?? row)
      .filter(Boolean);
    // A single row is centred; several are shown from the top one on.
    rows.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    for (const row of rows) {
      row.classList.add("spot");
      setTimeout(() => row.classList.remove("spot"), SPOT_MS);
    }
    rows[0]?.scrollIntoView({ block: rows.length > 1 ? "start" : "center" });
  });
}
