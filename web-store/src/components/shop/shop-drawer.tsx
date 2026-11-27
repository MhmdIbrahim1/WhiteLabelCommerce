"use client";

import { useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { focusBoundary } from "@/lib/workspace-dialog";

export function ShopDrawer({ title, triggerRef, close, children }: {
  title: string; triggerRef: RefObject<HTMLElement | null>; close: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const backdropPress = useRef(false);
  const titleId = useId();
  const { lang } = useLanguage();
  useLayoutEffect(() => {
    const node = ref.current!;
    const trigger = triggerRef.current;
    node.showModal();
    (node.querySelector<HTMLElement>("[data-drawer-focus]") ?? closeButton.current)?.focus({ preventScroll: true });
    return () => {
      node.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [triggerRef]);

  return <dialog ref={ref} aria-labelledby={titleId} className="sf-drawer"
    onCancel={e => { e.preventDefault(); close(); }}
    onPointerDown={e => { backdropPress.current = e.target === e.currentTarget; }}
    onClick={e => { if (backdropPress.current && e.target === e.currentTarget) close(); }}
    onKeyDown={e => {
      if (e.key !== "Tab") return;
      const elements = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(
        'a[href], button:enabled, input:enabled, select:enabled, textarea:enabled, [tabindex="0"]',
      )).filter(node => node.tabIndex >= 0 && node.getClientRects().length > 0);
      const next = focusBoundary(elements.indexOf(document.activeElement as HTMLElement), elements.length, e.shiftKey);
      if (next !== null) { e.preventDefault(); elements[next].focus(); }
    }}>
    <div className="sf-drawer-sheet">
      <header className="sf-drawer-head"><h2 id={titleId}>{title}</h2>
        <button ref={closeButton} type="button" className="sf-icon" onClick={close} aria-label={lang === "en" ? "Close" : "إغلاق"}>
          <X size={20}/>
        </button>
      </header>
      {children}
    </div>
  </dialog>;
}
