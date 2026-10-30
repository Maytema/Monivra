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
export const translate = (text) => {
  const value = currentLanguage().strings[text];
  return typeof value === "string" ? value : text;
};

// Translate a string with {name} placeholders and fill them in.
export const translateWith = (text, values) =>
  translate(text).replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);

const PLURAL_FORMS = ["one", "few", "many", "other"];

// Text with a count that agrees with the number: English has `one` and `other` forms,
// other languages list their forms under the English `other` text, in plural-category order.
export function translateCount(one, other, n) {
  const { strings, locale } = currentLanguage();
  const forms = strings[other];
  const form = new Intl.PluralRules(locale).select(n);
  const text = Array.isArray(forms)
    ? forms[Math.min(PLURAL_FORMS.indexOf(form), forms.length - 1)]
    : n === 1
      ? one
      : other;
  return text.replace("{n}", n);
}

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
const decode = (text) => text.replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e]);
const encode = (text) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Translate the text and the label attributes of finished markup, so every screen is
// translated in one place and no string has to be wrapped by hand.
export function translateMarkup(html) {
  const { strings } = currentLanguage();
  const lookup = (text) => {
    const translated = strings[decode(text)];
    return translated ? encode(translated) : text;
  };
  return html
    .replace(/>([^<>]*[A-Za-z][^<>]*)</g, (match, text) => {
      const [, before, body, after] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
      return `>${before}${lookup(body)}${after}<`;
    })
    .replace(
      /\b(aria-label|placeholder|title)="([^"]*)"/g,
      (match, name, text) => `${name}="${lookup(text)}"`,
    );
}

// Currency name in the interface language, e.g. "Киргизский сом" for KGS.
export function currencyName(code, fallback = code) {
  try {
    const name = new Intl.DisplayNames([currentLocale()], { type: "currency" }).of(code);
    return name.charAt(0).toLocaleUpperCase(currentLocale()) + name.slice(1);
  } catch {
    return fallback;
  }
}
