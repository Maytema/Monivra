// Plain numbers (percents, chart axes) in the language of the application, without the platform's number
// formatting: on the phone's engine every call of it goes through a slow bridge to the system.
const signs = (locale: string): [string, string] => (locale.startsWith("ru") ? [",", " "] : [".", ","]);

export function numberText(value: number, locale: string, maxFraction = 2): string {
  if (!Number.isFinite(value)) return "0";
  const [decimal, group] = signs(locale);
  const scale = 10 ** maxFraction;
  const rounded = Math.round(Math.abs(value) * scale);
  const whole = Math.floor(rounded / scale);
  let fraction = maxFraction ? String(rounded % scale).padStart(maxFraction, "0") : "";
  while (fraction.endsWith("0")) fraction = fraction.slice(0, -1);
  const digits = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return (value < 0 && rounded > 0 ? "-" : "") + digits + (fraction ? decimal + fraction : "");
}

// 1.2K / 1,2 тыс. for large numbers (as the platform's compact notation).
export function compactText(value: number, locale: string): string {
  const ru = locale.startsWith("ru");
  const steps: [number, string, string][] = [
    [1e12, "T", " трлн"],
    [1e9, "B", " млрд"],
    [1e6, "M", " млн"],
    [1e3, "K", " тыс."],
  ];
  for (const [size, en, rus] of steps) if (Math.abs(value) >= size) return numberText(value / size, locale, Math.abs(value) / size < 100 ? 1 : 0) + (ru ? rus : en);
  return numberText(value, locale, 1);
}
