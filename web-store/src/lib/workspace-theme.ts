import { resolveTheme, type PlatformTheme } from "./platform-theme.ts";
import { contrastRatio } from "./theme-contrast.ts";

export const workspaceModeCookie = "wlc_workspace_mode";
export type WorkspaceMode = "light" | "dark";

export function parseWorkspaceMode(value: unknown): WorkspaceMode {
  return value === "dark" ? "dark" : "light";
}

export function workspacePreferenceCookie(value: unknown, secure: boolean) {
  if (value !== "light" && value !== "dark") throw new TypeError("Invalid workspace mode");
  return { name: workspaceModeCookie, value, path: "/", sameSite: "lax" as const, httpOnly: true, secure, maxAge: 365 * 24 * 60 * 60 };
}

const palettes = {
  light: { canvas: "#F6F6F7", surface: "#FFFFFF", subtle: "#F4F4F5", line: "#DADBDD", ink: "#111315", muted: "#565B63", good: "#296044", danger: "#963D38" },
  dark: { canvas: "#0B0C0E", surface: "#121418", subtle: "#1C1F24", line: "#23262D", ink: "#F1F2F3", muted: "#B2B7C0", good: "#A7D5B4", danger: "#F0ACA5" },
};

export function resolveWorkspaceTokens(theme: PlatformTheme, mode: WorkspaceMode) {
  const brand = resolveTheme(theme);
  const p = palettes[mode];
  const accent = brand["--pt-accent"];
  const readableLink = [p.surface, p.canvas, p.subtle].every(bg => contrastRatio(accent, bg) >= 4.5);
  return {
    ...brand,
    "--ws-canvas": p.canvas, "--ws-good": p.good, "--ws-danger": p.danger,
    "--ws-link": readableLink ? accent : p.ink,
    "--ws-control-line": mode === "dark" ? "#767E89" : "#7F858D",
    "--pt-surface": p.surface, "--pt-card": p.subtle, "--pt-ink": p.ink, "--pt-muted": p.muted, "--pt-line": p.line,
  };
}
