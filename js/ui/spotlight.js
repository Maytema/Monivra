/* Shows where a thing is: scrolls to the rows of operations and flashes them once */

// Rows are found after the next drawing; they may be missing when the list does not show them.
export function spotlight(ids) {
  requestAnimationFrame(() => {
    const rows = ids
      .map((id) => document.querySelector(`[data-operation="${CSS.escape(id)}"]`))
      .filter(Boolean);
    rows[0]?.scrollIntoView({ block: "center" });
    for (const row of rows) {
      row.classList.add("spot");
      row.addEventListener("animationend", () => row.classList.remove("spot"), { once: true });
    }
  });
}
