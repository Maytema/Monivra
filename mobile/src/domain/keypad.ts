// The order of the digits of the calculator keypad (js/domain/keypad.js of the first application);
// the editing of the typed expression is `typeKey` in money.ts.
// Digits of the three upper rows, in the order chosen in settings.
export const keypadDigits = (reverse: boolean): string[] =>
  reverse ? ["1", "2", "3", "4", "5", "6", "7", "8", "9"] : ["7", "8", "9", "4", "5", "6", "1", "2", "3"];
