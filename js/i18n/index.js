/* Languages and text translation. To add a language: create js/i18n/<code>.js
   with a { "English text": "Translation" } object and list it in LANGUAGES. */
import { appData } from "../core/state.js";
import { russianStrings } from "./ru.js";

// English is the source language: its strings are the keys and need no table.
export const LANGUAGES = [
  { code: "en", name: "English", locale: "en-US", strings: {} },
  { code: "ru", name: "Русский", locale: "ru-RU", strings: russianStrings },
];

const DEFAULT_LANGUAGE = LANGUAGES[0];

export const isSupportedLanguage = (code) => LANGUAGES.some((language) => language.code === code);

// Language selected in the settings.
function currentLanguage() {
  return (
    LANGUAGES.find((language) => language.code === appData.settings.language) || DEFAULT_LANGUAGE
  );
}

// Browser locale tag of the selected language, for number and date formatting.
export const currentLocale = () => currentLanguage().locale;

// Translate a UI string; falls back to the English text.
export const translate = (text) => currentLanguage().strings[text] || text;
