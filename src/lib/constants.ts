// Public configuration only — no secrets live here.

export const DISPLAY_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CNY",
  "MYR",
  "AUD",
  "THB",
  "HKD",
  "IDR",
]

export const ALL_CURRENCIES = [
  "SGD",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CNY",
  "MYR",
  "AUD",
  "NZD",
  "THB",
  "HKD",
  "IDR",
  "PHP",
  "VND",
  "INR",
  "KRW",
  "TWD",
  "CHF",
  "CAD",
  "SEK",
]

export const CATEGORIES = [
  "Travel - Airfare",
  "Travel - Accommodation",
  "Travel - Ground Transport",
  "Meals & Entertainment",
  "Client Entertainment",
  "Office Supplies",
  "Software / Subscriptions",
  "Training & Conferences",
  "Medical / Wellness",
  "Telecommunications",
  "Marketing & Advertising",
  "Miscellaneous",
]

// Fallback leave types used when the SharePoint "Leave Types" list isn't
// configured yet. Once it is, the form loads types from there instead.
export const DEFAULT_LEAVE_TYPES: { name: string }[] = [
  { name: "Annual" },
  { name: "Medical" },
  { name: "Unpaid" },
  { name: "Compassionate" },
]

export const DEPARTMENTS = [
  "Finance & Operations",
  "Human Resources",
  "Sales & Marketing",
  "Information Technology",
  "Research & Development",
  "Legal & Compliance",
  "Executive & Management",
  "Customer Success",
  "Procurement",
  "Other",
]

export const CURRENCY_NAMES: Record<string, string> = {
  SGD: "Singapore Dollar",
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "British Pound",
  JPY: "Japanese Yen",
  CNY: "Chinese Yuan",
  MYR: "Malaysian Ringgit",
  AUD: "Australian Dollar",
  NZD: "New Zealand Dollar",
  THB: "Thai Baht",
  HKD: "Hong Kong Dollar",
  IDR: "Indonesian Rupiah",
  PHP: "Philippine Peso",
  VND: "Vietnamese Dong",
  INR: "Indian Rupee",
  KRW: "Korean Won",
  TWD: "Taiwan Dollar",
  CHF: "Swiss Franc",
  CAD: "Canadian Dollar",
  SEK: "Swedish Krona",
}

// Offline fallback rates (1 SGD → currency), used when /api/rates is unreachable.
export const FALLBACK_RATES: Record<string, number> = {
  SGD: 1,
  USD: 0.74,
  EUR: 0.69,
  GBP: 0.59,
  JPY: 111,
  CNY: 5.38,
  MYR: 3.42,
  AUD: 1.13,
  NZD: 1.21,
  THB: 26.9,
  HKD: 5.8,
  IDR: 11700,
  PHP: 42.5,
  VND: 18500,
  INR: 61.8,
  KRW: 990,
  TWD: 23.8,
  CHF: 0.66,
  CAD: 1.01,
  SEK: 7.9,
}

// Microsoft Entra ID (MSAL) — clientId + tenantId are public values, safe in the browser.
export const AUTH = {
  clientId: "b492e36f-a837-4b02-87cd-b6f363fb694f",
  tenantId: "7b788342-e05a-443d-a6eb-43624b103a65",
}
export const API_SCOPE = `api://${AUTH.clientId}/access_as_user`

// Currencies whose rates are shown without decimals.
export const BIG_UNIT_CURRENCIES = new Set(["JPY", "IDR", "VND", "KRW"])
