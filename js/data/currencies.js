/* Currencies: the list, default fixed rates and symbols.
   Rates are placeholders until live quotes are connected; every one can be edited. */

// Code, value of one unit in US dollars (approximate) and the countries that use it (ISO codes).
const TABLE = `
AED 0.2723 AE|AFN 0.0145 AF|ALL 0.0113 AL|AMD 0.0026 AM|ANG 0.559 CW SX|AOA 0.0011 AO
ARS 0.0008 AR|AUD 0.65 AU|AWG 0.5587 AW|AZN 0.588 AZ|BAM 0.56 BA|BBD 0.5 BB|BDT 0.0082 BD
BGN 0.56 BG|BHD 2.65 BH|BIF 0.00034 BI|BND 0.77 BN|BOB 0.1449 BO|BRL 0.18 BR|BSD 1 BS
BTN 0.0119 BT|BWP 0.073 BW|BYN 0.31 BY|BZD 0.5 BZ|CAD 0.72 CA|CDF 0.00035 CD|CHF 1.2 CH LI
CLP 0.00105 CL|CNY 0.139 CN|COP 0.00025 CO|CRC 0.002 CR|CZK 0.043 CZ|DJF 0.0056 DJ
DKK 0.145 DK GL|DOP 0.0165 DO|DZD 0.0075 DZ|EGP 0.02 EG|ETB 0.0074 ET
EUR 1.12 DE FR IT ES NL AT BE IE PT FI GR SK SI EE LV LT LU MT CY HR|FJD 0.44 FJ
GBP 1.337 GB|GEL 0.37 GE|GHS 0.08 GH|GMD 0.014 GM|GNF 0.000115 GN|GTQ 0.13 GT|GYD 0.0048 GY
HKD 0.128 HK|HNL 0.039 HN|HTG 0.0076 HT|HUF 0.0027 HU|IDR 0.000061 ID|ILS 0.27 IL
INR 0.0116 IN|IQD 0.00076 IQ|IRR 0.0000024 IR|ISK 0.0073 IS|JMD 0.0063 JM|JOD 1.41 JO
JPY 0.00674 JP|KES 0.0077 KE|KGS 0.01143 KG|KHR 0.00025 KH|KMF 0.0023 KM|KRW 0.00072 KR
KWD 3.26 KW|KZT 0.00206 KZ|LAK 0.000046 LA|LBP 0.0000112 LB|LKR 0.0033 LK|LRD 0.005 LR
LSL 0.055 LS|LYD 0.2 LY|MAD 0.103 MA|MDL 0.057 MD|MGA 0.00022 MG|MKD 0.0178 MK|MMK 0.00048 MM
MNT 0.00028 MN|MOP 0.124 MO|MRU 0.025 MR|MUR 0.022 MU|MVR 0.065 MV|MWK 0.00058 MW
MXN 0.052 MX|MYR 0.23 MY|MZN 0.0157 MZ|NAD 0.055 NA|NGN 0.00065 NG|NIO 0.027 NI|NOK 0.095 NO
NPR 0.0074 NP|NZD 0.59 NZ|OMR 2.6 OM|PAB 1 PA|PEN 0.27 PE|PGK 0.24 PG|PHP 0.0175 PH
PKR 0.0036 PK|PLN 0.26 PL|PYG 0.00013 PY|QAR 0.2747 QA|RON 0.22 RO|RSD 0.0095 RS
RUB 0.012 RU|RWF 0.0007 RW|SAR 0.2667 SA|SBD 0.12 SB|SCR 0.07 SC|SEK 0.1 SE|SGD 0.77 SG
SOS 0.00175 SO|SRD 0.026 SR|SZL 0.055 SZ|THB 0.03 TH|TJS 0.0937 TJ|TMT 0.2857 TM|TND 0.33 TN
TOP 0.42 TO|TRY 0.024 TR|TTD 0.147 TT|TWD 0.031 TW|TZS 0.00037 TZ|UAH 0.024 UA|UGX 0.00027 UG
USD 1 US EC SV PR|UYU 0.025 UY|UZS 0.000079 UZ|VND 0.00004 VN|VUV 0.0084 VU|WST 0.36 WS
XAF 0.0017 CM GA TD CG GQ CF|XCD 0.37 AG DM GD KN LC VC|XOF 0.0017 SN CI BF ML BJ NE TG GW
XPF 0.0092 NC PF|YER 0.004 YE|ZAR 0.055 ZA|ZMW 0.04 ZM
`;
// Rates of the first currencies of the application, kept as they were before the list grew.
const KEPT_RATES = {
  KGS: 1,
  USD: 87.5,
  EUR: 98,
  RUB: 1.05,
  TJS: 8.2,
  KZT: 0.18,
  CNY: 12.2,
  GBP: 117,
  AUD: 57,
  CAD: 63,
  JPY: 0.59,
  CHF: 105,
};
const BASE_RATE = KEPT_RATES.USD;

export const CURRENCIES = TABLE.split("|")
  .flatMap((chunk) => chunk.trim().split("\n"))
  .map((line) => {
    const [code, usd, ...regions] = line.trim().split(/\s+/);
    return { code, usd: Number(usd), regions };
  });
const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));
export const isKnownCurrency = (code) => BY_CODE.has(code);

// Fixed rates of all currencies: how many KGS one unit is worth.
export function defaultRates() {
  return Object.fromEntries(
    CURRENCIES.map(({ code, usd }) => [
      code,
      KEPT_RATES[code] ?? Number((usd * BASE_RATE).toPrecision(4)),
    ]),
  );
}
// Short sign of a currency, for example "$" or "€"; the code itself when it has no sign.
export function currencySymbol(code) {
  try {
    const part = new Intl.NumberFormat("en-US", { style: "currency", currency: code })
      .formatToParts(1)
      .find((p) => p.type === "currency");
    return part?.value || code;
  } catch {
    return code;
  }
}
