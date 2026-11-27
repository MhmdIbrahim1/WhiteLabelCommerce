"use client";

import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { focusBoundary, openWorkspaceDialog } from "@/lib/workspace-dialog";
import { useLanguage } from "./language-provider";

const focusable = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [tabindex]';

export function WorkspaceDrawer({ title, subtitle, onDismiss, returnFocusId, children }: {
  title: ReactNode; subtitle?: ReactNode; onDismiss: () => void; returnFocusId?: string; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const closing = useRef(false);
  const backdropPress = useRef(false);
  const heading = useId();
  const en = useLanguage().lang === "en";

  useLayoutEffect(() => {
    return openWorkspaceDialog(dialog.current!, close.current!, returnFocusId);
  }, [returnFocusId]);

  async function dismiss() {
    if (closing.current) return;
    closing.current = true;
    const node = dialog.current!;
    node.dataset.closing = "true";
    const animations = panel.current?.getAnimations() ?? [];
    await Promise.allSettled(animations.map(animation => animation.finished));
    if (node.isConnected) onDismiss();
  }

  return <dialog className="ws-inspector" ref={dialog} aria-labelledby={heading}
    onCancel={event => { event.preventDefault(); void dismiss(); }}
    onPointerDown={event => { backdropPress.current = event.target === event.currentTarget; }}
    onClick={event => { if (backdropPress.current && event.target === event.currentTarget) void dismiss(); }}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const elements = [...event.currentTarget.querySelectorAll<HTMLElement>(focusable)]
        .filter(el => el.tabIndex >= 0 && !el.matches(":disabled") && el.getClientRects().length > 0);
      const target = focusBoundary(elements.indexOf(document.activeElement as HTMLElement), elements.length, event.shiftKey);
      if (target !== null) { event.preventDefault(); elements[target].focus(); }
    }}>
    <div className="ws-inspector-panel" ref={panel}>
      <header className="ws-inspector-head"><div><h2 id={heading}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <button ref={close} type="button" className="ws-icon-button" aria-label={en ? "Close panel" : "إغلاق اللوحة"}
          onClick={() => void dismiss()}><X size={19} /></button></header>
      <div className="ws-inspector-body">{children}</div>
    </div>
  </dialog>;
}

export function DirectoryDrawer({ listHref, recordId, children, title, subtitle }: {
  listHref: string; recordId: string; children: ReactNode; title: ReactNode; subtitle?: ReactNode;
}) {
  const router = useRouter();
  return <WorkspaceDrawer title={title} subtitle={subtitle} returnFocusId={"inspect-" + recordId}
    onDismiss={() => router.replace(listHref, { scroll: false })}>{children}</WorkspaceDrawer>;
}

export function InspectRow({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  return <tr role="row" className="ws-inspect-row" onClick={event => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ||
      (event.target as Element).closest("a,button,input,select,label") || window.getSelection()?.toString()) return;
    event.currentTarget.querySelector<HTMLAnchorElement>("a[aria-haspopup=dialog]")?.focus({ preventScroll: true });
    router.replace(href, { scroll: false });
  }}>{children}</tr>;
}
