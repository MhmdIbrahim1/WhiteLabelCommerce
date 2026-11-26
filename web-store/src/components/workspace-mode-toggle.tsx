"use client";

import { useState, useTransition } from "react";
import { Moon, Sun } from "lucide-react";
import { useLanguage } from "./language-provider";
import { setWorkspaceMode } from "./workspace-mode-action";
import type { WorkspaceMode } from "@/lib/workspace-theme";

export function WorkspaceModeToggle({ mode }: { mode: WorkspaceMode }) {
  const en = useLanguage().lang === "en";
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  const dark = mode === "dark";
  const label = en ? "Dark mode" : "الوضع الداكن";
  return <>
    <button className="ws-icon-button" type="button" aria-label={label} aria-pressed={dark} title={label}
      disabled={pending} onClick={() => start(async () => {
        setFailed(false);
        try { await setWorkspaceMode(dark ? "light" : "dark"); } catch { setFailed(true); }
      })}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
    {failed && <small role="alert">{en ? "Couldn’t save the display preference." : "تعذّر حفظ تفضيل العرض."}</small>}
  </>;
}
