/* A save that failed must not look like a save that worked. The alert stays on the screen until a
   later save succeeds, and offers to keep the data in a file, which does not depend on the storage. */
import { translate } from "../i18n/index.js";

const ID = "save-alert";

// Shows the alert (once); a repeated failure does not stack another one.
export function showSaveFailure() {
  if (typeof document === "undefined" || document.getElementById(ID)) return;
  const box = document.createElement("div");
  box.id = ID;
  box.setAttribute("role", "alert");
  const text = document.createElement("p");
  text.textContent = translate(
    "Your latest changes are NOT saved: the storage is full or unavailable. Save a data file now, then free space by deleting old backups or photos.",
  );
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = translate("Save a data file");
  button.addEventListener("click", async () => {
    const { dataFile, saveDelivery } = await import("./file-actions.js");
    saveDelivery(dataFile());
  });
  box.append(text, button);
  document.body.append(box);
}

// Removes the alert after a save worked.
export function clearSaveFailure() {
  if (typeof document !== "undefined") document.getElementById(ID)?.remove();
}
