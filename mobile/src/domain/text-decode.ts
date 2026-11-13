// The text of a file's bytes: UTF-8 (the default), UTF-16 when the file starts with its mark, or
// Windows-1251 (Cyrillic files of older spreadsheets). Built in, because the phone's engine has no
// TextDecoder for anything but UTF-8. A byte that cannot be read becomes U+FFFD.
export type Encoding = "utf-8" | "windows-1251";

// Windows-1251, bytes 0x80–0xBF (0xC0–0xFF are А–я in order).
const CP1251_HIGH =
  "ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—\u0098™љ›њќћџ ЎўЈ¤Ґ¦§Ё©Є«¬­®Ї°±Ііґµ¶·ё№є»јЅѕї";

function utf8(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  const bad = () => {
    out += "�";
    i++;
  };
  while (i < bytes.length) {
    const b = bytes[i]!;
    if (b < 0x80) {
      out += String.fromCharCode(b);
      i++;
      continue;
    }
    const need = b >= 0xf0 && b < 0xf5 ? 3 : b >= 0xe0 ? 2 : b >= 0xc2 && b < 0xe0 ? 1 : -1;
    if (need < 0) {
      bad();
      continue;
    }
    // A sequence cut short is one replacement character for the bytes that belonged to it.
    let got = 0;
    while (got < need && i + 1 + got < bytes.length && (bytes[i + 1 + got]! & 0xc0) === 0x80) got++;
    if (got < need) {
      out += "\ufffd";
      i += 1 + got;
      continue;
    }
    let code = b & (need === 1 ? 0x1f : need === 2 ? 0x0f : 0x07);
    for (let k = 1; k <= need; k++) code = (code << 6) | (bytes[i + k]! & 0x3f);
    if ((need === 2 && code < 0x800) || (need === 3 && (code < 0x10000 || code > 0x10ffff)) || (code >= 0xd800 && code <= 0xdfff)) {
      bad();
      continue;
    }
    out += String.fromCodePoint(code);
    i += need + 1;
  }
  return out;
}

function utf16(bytes: Uint8Array, little: boolean): string {
  let out = "";
  for (let i = 2; i + 1 < bytes.length; i += 2) out += String.fromCharCode(little ? bytes[i]! | (bytes[i + 1]! << 8) : (bytes[i]! << 8) | bytes[i + 1]!);
  return out;
}

function cp1251(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b < 0x80 ? String.fromCharCode(b) : b < 0xc0 ? CP1251_HIGH[b - 0x80]! : String.fromCharCode(0x410 + b - 0xc0);
  return out;
}

export function decodeText(bytes: Uint8Array, encoding: Encoding): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return utf16(bytes, true);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return utf16(bytes, false);
  return encoding === "windows-1251" ? cp1251(bytes) : utf8(bytes);
}
