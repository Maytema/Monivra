/* First launch: choose between an empty start and a basic set of accounts and categories */
import { render } from "../app/shell.js";
import { APP_NAME } from "../core/constants.js";
import { appData, setAppData, setFirstLaunch } from "../core/state.js";
import { createStarterData } from "../data/defaults.js";
import { save } from "../data/storage.js";
import { translate, translateWith } from "../i18n/index.js";
import { buttonHtml } from "../ui/primitives.js";

// Replace the data with the chosen start, save it and leave the welcome screen.
function start(data) {
  setAppData(data);
  setFirstLaunch(false);
  save();
  render(true);
}

// Welcome screen with two ways to begin. Both leave everything editable.
export function welcomeView() {
  return `<div class="welcome"><h1>${translateWith("Welcome to {app}", { app: APP_NAME })}</h1><p>${translate("Start with a basic set of accounts and categories, or begin with a blank page. You can edit or delete everything later.")}</p>${buttonHtml(
    "Start with basic set",
    () => start(createStarterData()),
    "primary",
  )}${buttonHtml("Start empty", () => start({ ...appData }), "outline")}</div>`;
}
