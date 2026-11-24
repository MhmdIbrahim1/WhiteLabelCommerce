export function normalizePhone(value: string) {
  return value
    .trim()
    .replace(/[٠-٩]/g, (x) => String(x.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (x) => String(x.charCodeAt(0) - 1776))
    .replace(/[\s()-]/g, "")
    .replace(/^\+/, "");
}
