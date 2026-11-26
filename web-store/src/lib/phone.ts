export function normalizeDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, (x) => String(x.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (x) => String(x.charCodeAt(0) - 1776));
}

export function normalizePhone(value: string) {
  return normalizeDigits(value.trim())
    .replace(/[\s()-]/g, "")
    .replace(/^\+/, "");
}
