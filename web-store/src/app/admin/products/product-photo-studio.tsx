import Image from "next/image";
import Link from "next/link";
import { Camera, ImagePlus, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { limitReached } from "@/lib/billing";
import { optimizeProductImage } from "@/lib/image-optimize";
import type { ProductStudioDraft } from "@/lib/openai-studio";
import "./product-photo-studio.css";

export type StudioAllowances = {
  autofillUsed: number; autofillCap: number | null; studioUsed: number; studioCap: number | null;
};
type Tool = "autofill" | "studio";
type Quota = { used: number; cap: number | null };
type ActivePhoto = { file: File; url: string; originalBytes?: number };
type Result =
  | { ok: false; code: string; used?: number; cap?: number }
  | { ok: true; quota: Quota; draft: ProductStudioDraft }
  | { ok: true; quota: Quota; imageDataUrl: string; mime: string };

const presets = [
  ["crisp_white", "Pure White", "أبيض نقي"],
  ["warm_editorial", "Warm Editorial", "إضاءة دافئة"],
  ["executive_dark", "Executive Dark", "فحمي داكن"],
] as const;
const errors: Record<string, [string, string]> = {
  invalid_image: ["Choose a readable JPEG, PNG or WebP photo.", "اختر صورة صالحة بصيغة JPEG أو PNG أو WebP."],
  ai_failed: ["The studio couldn’t finish. Try again.", "تعذّر إكمال الطلب. حاول مرة أخرى."],
  ai_unavailable: ["AI tools are unavailable right now.", "أدوات الذكاء الاصطناعي غير متاحة حالياً."],
  rate_limited: ["Too many requests. Try again in a minute.", "أُرسلت طلبات كثيرة. حاول بعد دقيقة."],
  store_changed: ["The active store has changed. Reload this page.", "تغيّر المتجر النشط. أعد تحميل الصفحة."],
  forbidden: ["You need permission to manage products in this store.", "تحتاج إلى صلاحية إدارة المنتجات في هذا المتجر."],
  existing_photo: ["Choose a photo from your device to use the studio.", "اختر صورة من جهازك لاستخدام الاستوديو."],
};

function fileSize(bytes: number) {
  return bytes >= 1_000_000 ? (bytes / 1_000_000).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1_000)) + " KB";
}

function replaceFile(input: HTMLInputElement, file?: File) {
  const transfer = new DataTransfer();
  if (file) transfer.items.add(file);
  input.files = transfer.files;
}

function Photo({ src, caption }: { src: string; caption: string }) {
  return <figure className="product-studio-figure">
    <Image unoptimized src={src} width={320} height={224} alt={caption} />
    <figcaption>{caption}</figcaption>
  </figure>;
}

export function ProductPhotoStudio({ en, storeId, existingImage, aiEnabled, allowances,
  onBusyChange, onDraft, onUndo, canUndo }: {
  en: boolean; storeId: string; existingImage: string | null; aiEnabled: boolean; allowances: StudioAllowances;
  onBusyChange: (busy: boolean) => void; onDraft: (draft: ProductStudioDraft) => void; onUndo: () => void; canUndo: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState<ActivePhoto | null>(null);
  const [after, setAfter] = useState<{ url: string; mime: string } | null>(null);
  const [busy, setBusy] = useState<Tool | "optimize" | "accept" | null>(null);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [preset, setPreset] = useState<string>("crisp_white");
  const [quotas, setQuotas] = useState<Record<Tool, Quota>>({
    autofill: { used: allowances.autofillUsed, cap: allowances.autofillCap },
    studio: { used: allowances.studioUsed, cap: allowances.studioCap },
  });
  const { pending } = useFormStatus();
  const locked = Boolean(busy) || pending;
  const preview = active?.url || existingImage;
  const exhausted = (tool: Tool) => limitReached(quotas[tool].used, quotas[tool].cap);
  useEffect(() => () => { if (active) URL.revokeObjectURL(active.url); }, [active]);

  function working(operation: typeof busy) {
    setBusy(operation);
    onBusyChange(Boolean(operation));
  }
  function setFormPhoto(file: File, originalBytes?: number) {
    if (!input.current) return;
    replaceFile(input.current, file);
    setActive({ file, url: URL.createObjectURL(file), originalBytes });
    setAfter(null);
  }
  async function selectPhoto(picker: HTMLInputElement) {
    const file = picker.files?.[0];
    // Keep the form's successful control on its last prepared file throughout decoding.
    replaceFile(picker, active?.file);
    if (!file) return;
    working("optimize");
    setError("");
    try {
      const result = await optimizeProductImage(file);
      setFormPhoto(result.file, result.originalBytes);
    } catch {
      setError("invalid_image");
    } finally {
      working(null);
    }
  }

  async function studioInput(tool: Tool) {
    if (active) return tool === "studio" ? active.file : (await optimizeProductImage(active.file, "aiVision")).file;
    if (!existingImage) throw new Error("existing_photo");
    try {
      const response = await fetch(existingImage, { credentials: "omit", signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      return (await optimizeProductImage(new File([blob], "product", { type: blob.type }),
        tool === "studio" ? "product" : "aiVision")).file;
    } catch {
      throw new Error("existing_photo");
    }
  }

  async function generate(tool: Tool) {
    if (locked || !preview || !aiEnabled || exhausted(tool)) return;
    working(tool);
    setError("");
    try {
      const body = new FormData();
      body.set("storeId", storeId);
      body.set("image", await studioInput(tool));
      if (tool === "autofill") body.set("hint", hint.trim());
      else body.set("preset", preset);
      const path = tool === "autofill" ? "product-autofill" : "studio-background";
      const response = await fetch("/api/admin/ai/" + path, { method: "POST", body });
      const result: Result = await response.json();
      if (!result.ok) {
        if (response.status === 409 && result.code === "plan_limit_reached" &&
          typeof result.used === "number" && typeof result.cap === "number") {
          const quota = { used: result.used, cap: result.cap };
          setQuotas(prev => ({ ...prev, [tool]: quota }));
          return;
        }
        throw new Error(result.code);
      }
      if (!response.ok) throw new Error("ai_failed");
      if (tool === "autofill" && "draft" in result) onDraft(result.draft);
      else if (tool === "studio" && "imageDataUrl" in result) setAfter({ url: result.imageDataUrl, mime: result.mime });
      else throw new Error("ai_failed");
      setQuotas(prev => ({ ...prev, [tool]: result.quota }));
    } catch (cause) {
      setError(cause instanceof Error && Object.hasOwn(errors, cause.message) ? cause.message : "ai_failed");
    } finally {
      working(null);
    }
  }

  async function acceptPhoto() {
    if (!after) return;
    working("accept");
    setError("");
    try {
      const blob = await (await fetch(after.url)).blob();
      const ext = after.mime === "image/webp" ? "webp" : after.mime === "image/jpeg" ? "jpg" : "png";
      const file = new File([blob], "studio-product." + ext, { type: after.mime });
      if (file.size <= 4 * 1024 * 1024) setFormPhoto(file);
      else {
        const optimized = await optimizeProductImage(file);
        setFormPhoto(optimized.file, optimized.originalBytes);
      }
    } catch {
      setError("invalid_image");
    } finally {
      working(null);
    }
  }

  function quotaButton(tool: Tool, label: string) {
    return <button type="button" className="ws-button" disabled={locked || !aiEnabled || !preview || exhausted(tool)}
      aria-busy={busy === tool} onClick={() => generate(tool)}>
      <span>{label}</span>
      <bdi dir="ltr">{quotas[tool].used} / {quotas[tool].cap ?? "∞"}</bdi>
    </button>;
  }

  const feedback = error || (!aiEnabled ? "ai_unavailable" : "");
  return <section className="wide product-photo-studio" aria-labelledby="photo-studio-title">
    <h2 id="photo-studio-title"><Camera size={20} strokeWidth={1.5} aria-hidden="true" />
      {en ? "Product photo & AI Studio" : "صورة المنتج واستوديو الذكاء الاصطناعي"}</h2>
    <div className="product-studio-upload">
      <label>{en ? "Product photo" : "صورة المنتج"}
        <input ref={input} type="file" name="image" accept="image/jpeg,image/png,image/webp" disabled={locked}
          onChange={event => selectPhoto(event.currentTarget)} />
      </label>
      {active?.originalBytes !== undefined && <small className="product-studio-compression">
        {en ? "Optimized size" : "الحجم بعد الضغط"} <bdi dir="ltr">{fileSize(active.originalBytes)} → {fileSize(active.file.size)}</bdi>
      </small>}
      {preview && !after && <Photo src={preview} caption={en ? "Selected photo" : "الصورة المختارة"} />}
    </div>
    <div className="product-studio-tools">
      <div>
        <label>{en ? "Product hint (optional)" : "معلومة عن المنتج (اختياري)"}
          <input dir="auto" maxLength={200} value={hint} onChange={e => setHint(e.target.value)} disabled={locked || !aiEnabled}
            placeholder={en ? "Cotton oversized hoodie, Egyptian brand" : "هودي قطني واسع من علامة مصرية"} />
        </label>
        {quotaButton("autofill", en ? "Auto-fill details with AI" : "ملء بيانات المنتج بالذكاء الاصطناعي")}
        {canUndo && <button type="button" className="ws-button" disabled={locked} onClick={onUndo}>
          <Undo2 size={15} strokeWidth={1.5} aria-hidden="true" />{en ? "Undo AI fill" : "تراجع عن التعبئة"}</button>}
      </div>
      <div>
        <label>{en ? "Studio background" : "خلفية الاستوديو"}
          <select value={preset} onChange={e => { setPreset(e.target.value); setAfter(null); }} disabled={locked || !aiEnabled}>
            {presets.map(([id, english, arabic]) => <option key={id} value={id}>{en ? english : arabic}</option>)}
          </select>
        </label>
        {quotaButton("studio", en ? "Create studio photo" : "تحويل لصورة استوديو")}
      </div>
    </div>
    <div role="status" className="product-studio-status">
      {busy === "optimize" && (en ? "Optimizing photo…" : "جارٍ ضغط الصورة…")}
      {busy === "autofill" && (en ? "Preparing product details…" : "جارٍ إعداد بيانات المنتج…")}
      {busy === "studio" && (en ? "Creating studio photo…" : "جارٍ إنشاء صورة الاستوديو…")}
    </div>
    {feedback && <p role={error ? "alert" : "status"} className={error ? "ws-field-error" : undefined}>{errors[feedback][en ? 0 : 1]}</p>}
    {(exhausted("autofill") || exhausted("studio")) && <Link className="ws-text-link" href="/admin/billing#plans">
      {en ? "Upgrade your plan for more AI credits" : "رقّي باقتك للحصول على رصيد ذكاء اصطناعي أكبر"}</Link>}
    {after && preview && <div className="product-studio-review">
      <div className="product-studio-comparison">
        <Photo src={preview} caption={en ? "Before" : "قبل"} /><Photo src={after.url} caption={en ? "After" : "بعد"} />
      </div>
      <div className="ws-actions">
        <button type="button" className="ws-primary" disabled={locked} onClick={acceptPhoto}>
          <ImagePlus size={16} strokeWidth={1.5} aria-hidden="true" />{en ? "Use studio photo" : "اعتماد صورة الاستوديو"}</button>
        <button type="button" className="ws-button" disabled={locked} onClick={() => setAfter(null)}>
          {en ? "Keep original" : "إبقاء الأصلية"}</button>
      </div>
    </div>}
  </section>;
}
