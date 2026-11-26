"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { AdminPageTitle } from "./nav";

export function WorkspaceFrame({ sidebar, store, tools, children }: { sidebar: ReactNode; store: ReactNode; tools: ReactNode; children: ReactNode }) {
  const drawer = useRef<HTMLDialogElement>(null);
  const path = usePathname();
  const en = useLanguage().lang === "en";
  useEffect(() => { drawer.current?.close(); }, [path]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 961px)");
    const closeOnDesktop = () => { if (desktop.matches) drawer.current?.close(); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  const menu = en ? "Workspace menu" : "قائمة المتجر";
  return <div className="ws-layout">
    <a className="ws-skip" href="#workspace-content">{en ? "Skip to content" : "انتقل إلى المحتوى"}</a>
    <aside className="ws-sidebar">{sidebar}</aside>
    <dialog className="ws-drawer" id="workspace-menu" ref={drawer} aria-label={menu}
      onClick={e => { if (e.target === drawer.current || (e.target as Element).closest("a[href]")) drawer.current?.close(); }}>
      <div className="ws-drawer-panel"><button type="button" className="ws-icon-button ws-drawer-close" aria-label={en ? "Close menu" : "إغلاق القائمة"}
        onClick={() => drawer.current?.close()}><X size={18} /></button>{sidebar}</div>
    </dialog>
    <div className="ws-body">
      <header className="ws-toolbar"><div className="ws-toolbar-identity">
        <button data-tour="workspace-menu" type="button" className="ws-icon-button ws-menu-button" aria-label={menu}
          aria-haspopup="dialog" aria-controls="workspace-menu" onClick={() => drawer.current?.showModal()}><Menu size={19} /></button>
        <span className="ws-page-title"><AdminPageTitle /></span>{store}</div>
        <div className="ws-tools">{tools}</div>
      </header>
      <main className="ws-content" id="workspace-content" tabIndex={-1}>{children}</main>
    </div>
    <div data-workspace-overlay="" />
  </div>;
}
