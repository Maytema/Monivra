/* Time of day dialog: a dial for the hour and the minute, or two typed fields */
import { render } from "../app/shell.js";
import { currentLocale, translate } from "../i18n/index.js";
import { buttonHtml, iconButtonHtml, registerInput, registerAction, toast } from "./primitives.js";
import { closeLayers, openSheet } from "./kit.js";

// The dial is drawn in a box of this size; marks and hands are placed from its centre.
const DIAL = 256;
const OUTER_RADIUS = 102;
const INNER_RADIUS = 64;
// Pointer closer to the centre than this share of the dial picks the inner ring.
const INNER_SHARE = 0.62;

// Whether the language of the application writes the time with AM and PM.
export const twelveHour = () =>
  /^h1[12]$/.test(
    new Intl.DateTimeFormat(currentLocale(), { hour: "numeric" }).resolvedOptions().hourCycle,
  );

// "08:00 PM" or "20:00": a stored "HH:MM" as the language writes it.
export const timeLabel = (time) => {
  const [hour, minute] = time.split(":").map(Number);
  return new Date(Date.UTC(2000, 0, 1, hour, minute)).toLocaleTimeString(currentLocale(), {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const pad = (n) => String(n).padStart(2, "0");
// Number written on the dial for a slot of the hour ring (0 is the top).
const outerHour = (slot) => (slot === 0 ? 12 : slot);
const innerHour = (slot) => (slot === 0 ? 0 : slot + 12);

// Place of a point of the dial: `turns` clockwise from the top, `radius` from the centre.
const place = (turns, radius) => ({
  x: Math.round(Math.sin(turns * 2 * Math.PI) * radius * 10) / 10,
  y: Math.round(-Math.cos(turns * 2 * Math.PI) * radius * 10) / 10,
});

// Dialog for a time of day; `fn` gets "HH:MM".
export function timePicker(time, fn) {
  const twelve = twelveHour();
  const state = {
    hour: Number(time.split(":")[0]),
    minute: Number(time.split(":")[1]),
    part: "hour",
    typing: false,
    hourText: "",
    minuteText: "",
  };
  const shownHour = () => (twelve ? state.hour % 12 || 12 : state.hour);

  // Where the hand points and what the knob says for the part being set.
  const hand = () => {
    if (state.part === "minute")
      return { turns: state.minute / 60, radius: OUTER_RADIUS, text: pad(state.minute) };
    const inner = !twelve && (state.hour === 0 || state.hour > 12);
    return {
      turns: (state.hour % 12) / 12,
      radius: inner ? INNER_RADIUS : OUTER_RADIUS,
      text: twelve ? String(shownHour()) : pad(state.hour),
    };
  };
  // Picks the hour or the minute from a point of the dial.
  const pick = ({ turns, share }) => {
    if (state.part === "minute") state.minute = Math.round(turns * 60) % 60;
    else {
      const slot = Math.round(turns * 12) % 12;
      if (twelve) state.hour = slot + (state.hour >= 12 ? 12 : 0);
      else state.hour = share < INNER_SHARE ? innerHour(slot) : outerHour(slot) % 24;
    }
    paint();
  };
  // Moves the hand and the numbers while a finger is on the dial (a full render would drop it).
  const paint = () => {
    const root = document.querySelector(".clock-picker");
    if (!root) return;
    const { turns, radius, text } = hand();
    const { x, y } = place(turns, radius);
    const dial = root.querySelector(".clock-dial");
    dial.style.setProperty("--turns", turns);
    dial.style.setProperty("--radius", radius);
    dial.style.setProperty("--x", x);
    dial.style.setProperty("--y", y);
    root.querySelector(".clock-knob").textContent = text;
    root.querySelector('[data-part="hour"]').textContent = pad(shownHour());
    root.querySelector('[data-part="minute"]').textContent = pad(state.minute);
  };
  const choosePart = (part) => () => {
    state.part = part;
    render();
  };
  const mark = (text, x, y, chosen) =>
    `<span class="clock-mark ${chosen ? "chosen" : ""}" style="--x:${x};--y:${y}">${text}</span>`;
  const marks = () => {
    const ring = (label, radius, chosen) =>
      Array.from({ length: 12 }, (_, slot) => {
        const { x, y } = place(slot / 12, radius);
        return mark(label(slot), x, y, chosen === label(slot));
      }).join("");
    if (state.part === "minute")
      return Array.from({ length: 12 }, (_, slot) => {
        const { x, y } = place(slot / 12, OUTER_RADIUS);
        return mark(pad(slot * 5), x, y, false);
      }).join("");
    return (
      ring(outerHour, OUTER_RADIUS) +
      (twelve ? "" : ring((slot) => pad(innerHour(slot)), INNER_RADIUS))
    );
  };
  const dialHtml = () => {
    const { turns, radius, text } = hand();
    const { x, y } = place(turns, radius);
    // After the hour is chosen the minute comes next.
    const action = registerAction(() => {
      if (state.part === "hour") state.part = "minute";
      render();
    });
    const move = registerInput(pick);
    return `<div class="clock-dial" style="--size:${DIAL};--turns:${turns};--radius:${radius};--x:${x};--y:${y}" data-dial="${move}" data-settled="${action}" role="group" aria-label="${translate(state.part === "hour" ? "Hour" : "Minute")}">${marks()}<span class="clock-hand"></span><span class="clock-knob">${text}</span></div>`;
  };

  // Typed mode: two number fields under the same big numbers.
  const field = (part, label, value) =>
    `<label class="clock-field"><input class="clock-part chosen" inputmode="numeric" maxlength="2" autocomplete="off" aria-label="${translate(label)}" value="${value}" data-input="${registerInput((v) => (state[part + "Text"] = v.replace(/\D/g, "")))}"><small>${translate(label)}</small></label>`;
  const headHtml = () => {
    const parts = state.typing
      ? field("hour", "Hour", state.hourText) +
        `<span class="clock-colon">:</span>` +
        field("minute", "Minute", state.minuteText)
      : buttonHtml(
          pad(shownHour()),
          choosePart("hour"),
          "clock-part " + (state.part === "hour" ? "chosen" : ""),
          `data-part="hour" aria-label="${translate("Hour")}"`,
        ) +
        `<span class="clock-colon">:</span>` +
        buttonHtml(
          pad(state.minute),
          choosePart("minute"),
          "clock-part " + (state.part === "minute" ? "chosen" : ""),
          `data-part="minute" aria-label="${translate("Minute")}"`,
        );
    const period = twelve
      ? `<div class="clock-period">${["AM", "PM"]
          .map((name, i) =>
            buttonHtml(
              name,
              () => {
                state.hour = (state.hour % 12) + i * 12;
                render();
              },
              "clock-part " + (Math.floor(state.hour / 12) === i ? "chosen" : ""),
            ),
          )
          .join("")}</div>`
      : "";
    return `<div class="clock-head">${parts}${period}</div>`;
  };

  // The typed text as a time of day, or null when it is not one.
  const typed = () => {
    const hour = Number(state.hourText),
      minute = Number(state.minuteText);
    if (state.hourText === "" || state.minuteText === "" || minute > 59) return null;
    if (twelve)
      return hour >= 1 && hour <= 12
        ? { hour: (hour % 12) + (state.hour >= 12 ? 12 : 0), minute }
        : null;
    return hour <= 23 ? { hour, minute } : null;
  };
  const toggleTyping = () => {
    if (state.typing) {
      const value = typed();
      if (!value) return toast("Enter a valid time");
      Object.assign(state, value);
    } else {
      state.hourText = pad(shownHour());
      state.minuteText = pad(state.minute);
    }
    state.typing = !state.typing;
    state.part = "hour";
    render();
  };
  const confirm = () => {
    if (state.typing) {
      const value = typed();
      if (!value) return toast("Enter a valid time");
      Object.assign(state, value);
    }
    fn(`${pad(state.hour)}:${pad(state.minute)}`);
    closeLayers();
  };

  openSheet(
    () =>
      `<div class="clock-picker"><small class="calendar-caption">${translate("Select time")}</small>${headHtml()}${state.typing ? "" : dialHtml()}<div class="dialog-actions clock-actions">${iconButtonHtml(
        state.typing ? "clock" : "keyboard",
        state.typing ? "Dial" : "Keyboard",
        toggleTyping,
      )}<span class="grow"></span>${buttonHtml("Cancel", () => closeLayers(), "text-button")}${buttonHtml("OK", confirm, "text-button")}</div></div>`,
    "Select time",
    "dialog",
  );
}
