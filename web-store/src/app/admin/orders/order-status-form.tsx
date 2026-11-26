"use client";
import { showToast } from "@/components/floating-toast";
import { SubmitButton } from "@/components/submit-button";
import { useState } from "react";
import {
  Truck,
  Link2,
  Copy,
  Check,
  MessageCircle,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { orderStatusLabel } from "@/lib/i18n";
import {
  CARRIER_PRESETS,
  buildTrackingUrl,
  findCarrierPreset,
} from "@/lib/shipping";
import { useLanguage } from "@/components/language-provider";
import { updateOrder, ensureDeliveryToken } from "../mutations";

export function OrderStatusForm({
  orderId,
  currentStatus,
  options,
  shippingCarrier,
  trackingNumber,
  trackingUrl,
  courierNote,
  deliveryToken,
  shippingAddress,
  phone,
  totalLabel,
}: {
  orderId: string;
  currentStatus: string;
  options: string[];
  shippingCarrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  courierNote: string | null;
  deliveryToken: string | null;
  shippingAddress: string;
  phone: string | null;
  totalLabel: string;
}) {
  const { lang } = useLanguage();
  const isEn = lang === "en";
  const initialPreset = findCarrierPreset(shippingCarrier ?? "");
  const allOptions =
    currentStatus === "shipped" ? ["shipped", ...options] : options;
  const [selectedStatus, setSelectedStatus] = useState(
    options[0] ?? currentStatus,
  );
  const [carrierPreset, setCarrierPreset] = useState<string>(
    initialPreset
      ? initialPreset.key
      : shippingCarrier
        ? "custom"
        : "bosta",
  );
  const [customCarrier, setCustomCarrier] = useState(
    initialPreset ? "" : (shippingCarrier ?? ""),
  );
  const [awb, setAwb] = useState(trackingNumber ?? "");
  const [manualUrl, setManualUrl] = useState(trackingUrl ?? "");
  const [note, setNote] = useState(courierNote ?? "");
  const [copied, setCopied] = useState(false);

  const previewAutoUrl = buildTrackingUrl(carrierPreset, awb, manualUrl);
  const showShippingFields = selectedStatus === "shipped";
  const showCancelWarning = selectedStatus === "cancelled";

  const buildAbsoluteDeliveryLink = () =>
    deliveryToken
      ? `${window.location.origin}/delivery/${deliveryToken}`
      : "";

  const handleCopyDeliveryLink = async () => {
    const link = buildAbsoluteDeliveryLink();
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      showToast({ kind: "success", message: document.documentElement.lang.startsWith("en") ? "Copied to clipboard" : "تم النسخ" });
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {}
  };

  const handleShareWhatsApp = () => {
    const link = buildAbsoluteDeliveryLink();
    if (!link) return;
    const text = isEn
      ? `Delivery for Order #${orderId.slice(0, 8)}\nAddress: ${shippingAddress}${phone ? `\nCustomer Phone: ${phone}` : ""}\nAmount to Collect: ${totalLabel}\nOne-Tap Confirmation Link:\n${link}`
      : `توصيل طلب #${orderId.slice(0, 8)}\nالعنوان: ${shippingAddress}${phone ? `\nهاتف العميل: ${phone}` : ""}\nالمطلوب تحصيله: ${totalLabel}\nرابط تأكيد التسليم:\n${link}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <div className="stack" style={{ gap: "1.15rem" }}>
      {allOptions.length > 0 && (
        <form className="order-fulfillment-form" action={updateOrder}>
          <input type="hidden" name="id" value={orderId} />
          <input type="hidden" name="previous" value={currentStatus} />
          <input
            type="hidden"
            name="existing_delivery_token"
            value={deliveryToken ?? ""}
          />

          <div className="inline">
            <label style={{ flex: "1 1 200px" }}>
              {isEn ? "Update Order Status" : "تحديث حالة الطلب"}
              <select
                name="status"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
              >
                {allOptions.map((s) => (
                  <option key={s} value={s}>
                    {s === "shipped" && currentStatus === "shipped"
                      ? isEn
                        ? "Edit Shipping Info (Shipped)"
                        : "تعديل بيانات الشحن (تم الشحن)"
                      : orderStatusLabel(s, lang)}
                  </option>
                ))}
              </select>
            </label>
            <SubmitButton type="submit">
              {selectedStatus === "shipped" ? (
                <>
                  <Truck size={16} />{" "}
                  {isEn
                    ? "Save Shipping & Update Status"
                    : "حفظ الشحن وتحديث الحالة"}
                </>
              ) : isEn ? (
                "Update Status"
              ) : (
                "تحديث الحالة"
              )}
            </SubmitButton>
          </div>

          {showShippingFields && (
            <div className="shipping-drawer">
              <h3>
                <Truck size={17} />{" "}
                {isEn
                  ? "Zero-Contract Shipping & Tracking Details"
                  : "بيانات الشحن والتتبع (بدون تعاقد خارجي)"}
              </h3>
              <div className="fields">
                <label>
                  {isEn ? "Shipping Carrier" : "شركة الشحن / وسيلة التوصيل"}
                  <select
                    name="carrier_preset"
                    value={carrierPreset}
                    onChange={(e) => setCarrierPreset(e.target.value)}
                  >
                    {CARRIER_PRESETS.map((c) => (
                      <option key={c.key} value={c.key}>
                        {isEn ? c.label_en : c.label}
                      </option>
                    ))}
                  </select>
                </label>

                {carrierPreset === "custom" && (
                  <label>
                    {isEn ? "Custom Carrier Name" : "اسم شركة الشحن المخصصة"}
                    <input
                      name="custom_carrier"
                      value={customCarrier}
                      onChange={(e) => setCustomCarrier(e.target.value)}
                      placeholder={
                        isEn ? "e.g. Sprint Express" : "مثال: سبرينت إكسبرس"
                      }
                      maxLength={80}
                    />
                  </label>
                )}

                <label>
                  {isEn
                    ? "Tracking / AWB Number (optional)"
                    : "رقم التتبع / البوليصة (اختياري)"}
                  <input
                    name="tracking_number"
                    dir="ltr"
                    value={awb}
                    onChange={(e) => setAwb(e.target.value)}
                    placeholder="123456789"
                    maxLength={80}
                  />
                </label>

                <label className="wide">
                  {isEn
                    ? "Public Tracking URL (auto-generated or custom)"
                    : "رابط التتبع العام (يُنشأ تلقائياً أو أدخل رابطاً مخصصاً)"}
                  <input
                    name="tracking_url"
                    type="url"
                    dir="ltr"
                    value={manualUrl}
                    onChange={(e) => setManualUrl(e.target.value)}
                    placeholder={previewAutoUrl || "https://..."}
                  />
                  {!manualUrl && previewAutoUrl && (
                    <small className="auto-url-hint" dir="ltr">
                      <Link2 size={13} /> {isEn ? "Auto:" : "تلقائي:"}{" "}
                      {previewAutoUrl}
                    </small>
                  )}
                </label>

                <label className="wide">
                  {isEn
                    ? "Courier Note (optional — driver phone or delivery window)"
                    : "ملاحظة المندوب (اختياري — مثل رقم هاتف المندوب أو موعد التسليم)"}
                  <input
                    name="courier_note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={
                      isEn
                        ? "e.g. Driver Ahmed · 01012345678"
                        : "مثال: المندوب أحمد · 01012345678"
                    }
                    maxLength={240}
                  />
                </label>
              </div>
            </div>
          )}

          {showCancelWarning && (
            <p className="cancel-stock-note" role="status">
              <AlertTriangle size={16} />{" "}
              {isEn
                ? "Cancelling this order automatically restores product quantities back to stock."
                : "عند إلغاء الطلب سيتم إعادة كميات المنتجات تلقائياً إلى المخزون."}
            </p>
          )}
        </form>
      )}

      {(currentStatus === "confirmed" || currentStatus === "shipped") && (
        <div className="delivery-link-box">
          <div className="row">
            <div>
              <strong>
                {isEn
                  ? "One-Tap Courier Delivery Confirmation Link"
                  : "رابط تأكيد التسليم بضغطة واحدة للمندوب"}
              </strong>
              <p>
                {isEn
                  ? "Send this link to the courier via WhatsApp to confirm delivery directly from their phone without signing in."
                  : "أرسل هذا الرابط للمندوب عبر واتساب ليؤكد تسليم الطلب مباشرة من جواله بدون تسجيل دخول."}
              </p>
            </div>
          </div>

          {deliveryToken ? (
            <div className="delivery-link-actions">
              <code className="code delivery-url-code" dir="ltr">
                /delivery/{deliveryToken}
              </code>
              <div className="inline">
                <button
                  type="button"
                  className="btn-outline-admin"
                  onClick={handleCopyDeliveryLink}
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied
                    ? isEn
                      ? "Copied"
                      : "تم النسخ"
                    : isEn
                      ? "Copy Courier Link"
                      : "نسخ رابط المندوب"}
                </button>
                <button
                  type="button"
                  className="btn-whatsapp-admin"
                  onClick={handleShareWhatsApp}
                >
                  <MessageCircle size={15} />{" "}
                  {isEn ? "Share via WhatsApp" : "إرسال عبر واتساب"}
                </button>
                <a
                  className="btn-outline-admin"
                  href={`/delivery/${deliveryToken}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={15} />{" "}
                  {isEn ? "Preview Courier Page" : "معاينة صفحة المندوب"}
                </a>
              </div>
            </div>
          ) : (
            <form action={ensureDeliveryToken} style={{ marginTop: "0.5rem" }}>
              <input type="hidden" name="id" value={orderId} />
              <SubmitButton type="submit" className="btn-outline-admin">
                <Link2 size={15} />{" "}
                {isEn
                  ? "Generate Courier Link"
                  : "إنشاء رابط تأكيد للمندوب"}
              </SubmitButton>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
