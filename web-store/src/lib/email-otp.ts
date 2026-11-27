import { normalizeDigits } from "./phone.ts";

export const OTP_LENGTH = 6;
export const RESEND_SECONDS = 60;
export const emptyOtp = (): string[] => Array<string>(OTP_LENGTH).fill("");

export function normalizeOtp(value: string): string {
  return normalizeDigits(value).replace(/[\s-]/g, "");
}

export function validOtp(value: string) {
  return /^[0-9]{6}$/.test(normalizeOtp(value));
}

export function enterOtp(cells: string[], index: number, input: string) {
  const digits = normalizeOtp(input);
  if (!/^\d{1,6}$/.test(digits)) return { cells, focus: index };
  const start = digits.length === OTP_LENGTH ? 0 : index;
  const result = cells.slice();
  const chunk = digits.slice(0, OTP_LENGTH - start);
  result.splice(start, chunk.length, ...chunk);
  return { cells: result, focus: start + chunk.length };
}

export function navigateOtp(cells: string[], index: number, key: string) {
  if (key === "ArrowLeft") return { cells, focus: Math.max(0, index - 1) };
  if (key === "ArrowRight") return { cells, focus: Math.min(OTP_LENGTH - 1, index + 1) };
  if (key !== "Backspace" && key !== "Delete") return null;
  const focus = key === "Backspace" && !cells[index] ? Math.max(0, index - 1) : index;
  const result = cells.slice();
  result[focus] = "";
  return { cells: result, focus };
}
