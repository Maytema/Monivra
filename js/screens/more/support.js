/* Instructions and support pages */
import { APP_NAME } from "../../core/constants.js";
import { appData } from "../../core/state.js";
import { save } from "../../data/storage.js";
import { translate, translateWith } from "../../i18n/index.js";
import { GUIDES } from "../guides.js";
import { openPage } from "../../ui/navigation.js";
import { buttonHtml, menuRowHtml, toast } from "../../ui/primitives.js";

// Topics of the Support page: the heading, the text of the page and the row icon.
export const SUPPORT_TOPICS = {
  bugReport: {
    title: "Report a bug",
    icon: "help",
    text: [
      "Please describe the problem in as much detail as possible. What steps do you take before the problem occurs? What results do you get and what do you expect?",
      "Please attach screenshots or screen recordings to your message that demonstrate the issue. This will greatly help us understand and resolve the issue faster.",
    ],
  },
  featureRequest: {
    title: "Request a feature",
    icon: "help",
    text: [
      "Please describe your idea in as much detail as possible so that we can understand it better.",
      "Attach sketches, examples, or any materials that could visually explain what exactly you want to see.",
      "If mathematical calculations are required, please attach information or sources that will help us better understand these calculations.",
    ],
  },
  usageQuestion: {
    title: "Question on how to use",
    icon: "help",
    instructions: true,
    text: [
      "Before asking a question, please read the instructions explaining various aspects of using the app.",
      "If you still have questions after reading, please write to us.",
    ],
  },
  otherSupport: {
    title: "Other",
    icon: "help",
    text: [
      "Write anything, in any volume. We will definitely read everything you send, regardless of the length of the letter!",
    ],
  },
};

export function instructionsPage() {
  const body = `<div class="help-intro">${translateWith("Learn the basics of {app}", { app: APP_NAME })}</div>${menuRowHtml(
    "Repeat hints",
    "repeat",
    () => {
      appData.settings.dismissedHints = [];
      save();
      toast("Hints will be shown again");
    },
    "Restart tooltips throughout the application",
  )}${GUIDES.map((g) => menuRowHtml(g.title, g.icon, () => openPage("guide:" + g.id), g.about)).join("")}`;
  return { title: "Instructions", body };
}

export function guidePage(id) {
  const guide = GUIDES.find((g) => g.id === id);
  const body = `<div class="guide">${guide.sections.map(([heading, text]) => `<h3>${translate(heading)}</h3><p>${translate(text)}</p>`).join("")}</div>`;
  return { title: guide.title, body };
}

export function supportPage() {
  const body = Object.entries(SUPPORT_TOPICS)
    .map(([key, topic]) => menuRowHtml(topic.title, topic.icon, () => openPage(key)))
    .join("");
  return { title: "Support", body };
}

export function supportTopicPage(kind) {
  const topic = SUPPORT_TOPICS[kind];
  const body = `<div class="support-page"><div class="support-text">${topic.text.map((t) => `<p>${translate(t)}</p>`).join("")}${topic.instructions ? buttonHtml("View instructions", () => openPage("instructions"), "outline") : ""}</div><div class="support-notice"><p>${translate("You will be redirected to the email sending application.")}</p><p>${translate("A correctly completed letter will help process your request faster.")}</p></div><div class="support-actions">${buttonHtml("Continue", () => (location.href = `mailto:?subject=${encodeURIComponent(translate(topic.title))}`), "primary")}</div></div>`;
  return { title: topic.title, body };
}
