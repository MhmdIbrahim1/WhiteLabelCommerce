"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, Info, ShoppingBag, X } from "lucide-react";
import { useLanguage } from "./language-provider";
import "./floating-toast.css";

type Toast = {
  message: string;
  kind?: "cart" | "info" | "success" | "error";
  image?: string | null;
  action?: { label: string; href: string };
};
let nextId = 0;
let active: (Toast & { id: number }) | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const snapshot = () => active;
const empty = () => null;

export function showToast(toast: Toast) {
  active = { ...toast, id: ++nextId };
  listeners.forEach((listener) => listener());
}
function dismiss(id: number) {
  if (active?.id !== id) return;
  active = null;
  listeners.forEach((listener) => listener());
}

export function ToastFeedback({ message, kind }: Pick<Toast, "message" | "kind">) {
  useEffect(() => { if (message) showToast({ message, kind }); }, [message, kind]);
  return null;
}

export function FloatingToastHost() {
  const toast = useSyncExternalStore(subscribe, snapshot, empty);
  useEffect(() => {
    const invalid = (event: Event) => {
      const field = event.target;
      if ((field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) && field.validationMessage) {
        showToast({ message: field.validationMessage, kind: "error" });
      }
    };
    document.addEventListener("invalid", invalid, true);
    return () => document.removeEventListener("invalid", invalid, true);
  }, []);
  return toast && <Banner key={toast.id} toast={toast} />;
}

function Banner({ toast }: { toast: Toast & { id: number } }) {
  const { lang } = useLanguage();
  const router = useRouter();
  const banner = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; time: number; pointer: number } | null>(null);
  const kind = toast.kind ?? "info";
  const Icon = { cart: ShoppingBag, success: Check, info: Info, error: CircleAlert }[kind];
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(toast.id), toast.action ? 6500 : 4500);
    const header = document.querySelector(".shop-head");
    const measure = () => anchor.current?.style.setProperty("--header-bottom", (header?.getBoundingClientRect().height ?? 0) + "px");
    measure();
    const observer = new ResizeObserver(measure);
    if (header) observer.observe(header);
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, [toast.id, toast.action]);
  function finish(x: number, time: number, cancelled: boolean) {
    const start = gesture.current;
    const node = banner.current;
    gesture.current = null;
    if (!start || !node) return;
    const delta = x - start.x;
    const speed = Math.abs(delta) / Math.max(1, time - start.time);
    delete node.dataset.dragging;
    if (!cancelled && (Math.abs(delta) >= 72 || (Math.abs(delta) > 16 && speed > 0.6))) {
      node.style.transform = "translate3d(" + (delta > 0 ? "110vw" : "-110vw") + ",0,0)";
      node.dataset.leaving = "true";
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) dismiss(toast.id);
    } else node.style.transform = "";
  }
  return <div className="toast-anchor" ref={anchor} dir={lang === "ar" ? "rtl" : "ltr"}>
    <div className="floating-toast" data-kind={kind} ref={banner}
      onPointerDown={(e) => {
        if (!e.isPrimary || e.button !== 0 || (e.target as Element).closest("button,a")) return;
        gesture.current = { x: e.clientX, time: e.timeStamp, pointer: e.pointerId };
        e.currentTarget.dataset.dragging = "true";
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (gesture.current?.pointer === e.pointerId)
          e.currentTarget.style.transform = "translate3d(" + (e.clientX - gesture.current.x) + "px,0,0)";
      }}
      onPointerUp={(e) => finish(e.clientX, e.timeStamp, false)}
      onPointerCancel={(e) => finish(e.clientX, e.timeStamp, true)}
      onTransitionEnd={(e) => { if (e.propertyName === "transform" && e.currentTarget.dataset.leaving) dismiss(toast.id); }}>
      {toast.image ? <Image unoptimized src={toast.image} width={40} height={40} alt="" /> : <span className="toast-symbol"><Icon size={19} /></span>}
      <span className="toast-message" role={kind === "error" ? "alert" : "status"}>{toast.message}</span>
      {toast.action && <Link href={toast.action.href} onClick={e => {
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        router.push(toast.action!.href);
        dismiss(toast.id);
      }}>{toast.action.label}</Link>}
      <button type="button" aria-label={lang === "ar" ? "إغلاق" : "Dismiss"} onClick={() => dismiss(toast.id)}><X size={17} /></button>
    </div>
  </div>;
}
