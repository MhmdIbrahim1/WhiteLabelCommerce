export const emailPasswordResetEnabled = process.env.NEXT_PUBLIC_EMAIL_PASSWORD_RESET_ENABLED === "true";
export const validPassword = (value: unknown): value is string =>
  typeof value === "string" && value.length >= 8 && value.length <= 128;

export function matchesRequestOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
