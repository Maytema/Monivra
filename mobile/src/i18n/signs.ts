// Short signs of currencies ("$"), generated once from the platform data with the "en-US" format, so that the
// list of currencies never asks the phone's engine for them (each such call is slow there). A currency
// that is missing has no sign of its own: its code stands for it.
export const SIGNS: Record<string, string> = {
 "AUD": "A$",
 "BRL": "R$",
 "CAD": "CA$",
 "CNY": "CN¥",
 "EUR": "€",
 "GBP": "£",
 "HKD": "HK$",
 "ILS": "₪",
 "INR": "₹",
 "JPY": "¥",
 "KRW": "₩",
 "MXN": "MX$",
 "NZD": "NZ$",
 "PHP": "₱",
 "TWD": "NT$",
 "USD": "$",
 "VND": "₫",
 "XAF": "FCFA",
 "XCD": "EC$",
 "XOF": "F CFA",
 "XPF": "CFPF"
};
