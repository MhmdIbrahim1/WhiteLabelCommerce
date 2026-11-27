import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, FileText, MapPin } from "lucide-react";
import { DataCell, StatusDot, WorkspaceHeading, WorkspaceTable } from "@/components/workspace-data";
import { checked, requireAdmin } from "@/lib/db";
import { money, date } from "@/lib/brand";
import { t, translateColor, localizedText, orderStatusLabel } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { orderAmounts, orderLabels } from "@/lib/order-payment";
import { isRecordId } from "@/lib/workspace-directory";
import { isSafeHttpUrl, localizeCarrierLabel } from "@/lib/shipping";
import { normalizeReturnRecord, returnStatusMeta } from "@/lib/returns";
import { Notice } from "../ui";
import { PrintButton } from "./print-button";
import { OrderStatusForm } from "./order-status-form";

export async function OrderRecord({ id, print, drawer = false, resultCode }: {
  id: string; print?: string | string[]; drawer?: boolean; resultCode?: string | string[];
}) {
  const [{ db, storeId, activeStore }, lang] = await Promise.all([requireAdmin("manage_orders"), getServerLang()]);
  if (!isRecordId(id)) notFound();
  const isEn = lang === "en";
  const invoice = print === "invoice";
  const printDocument = invoice || print === "label";
  const [result, returnRes, tokenRes] = await Promise.all([
    db.from("orders").select("id,created_at,status,user_id,customer_id,recipient_name,shipping_address,phone,lat,lng,shipping_carrier,tracking_number,tracking_url,courier_note,shipped_at,delivered_at,payment_method,payment_status,payment_review,subtotal,shipping_fee,coupon_code,discount_amount,wallet_discount,cashback_earned,total,currency,order_items(id,product_name,size,color,quantity,unit_price)")
      .eq("id", id).eq("store_id", storeId).maybeSingle(),
    printDocument ? null : db.from("return_requests").select("*").eq("order_id", id)
      .eq("store_id", storeId).order("created_at", { ascending: false }).limit(1),
    printDocument ? null : db.rpc("merchant_order_delivery_token", { p_store_id: storeId, p_order_id: id }),
  ]);
  if (!result.error && !result.data) {
    if (drawer) return <p role="status">{isEn ? "This order is no longer in this store." : "لم يعد هذا الطلب متاحاً في المتجر."}</p>;
    notFound();
  }
  const o = checked(result);
  if (tokenRes?.error) throw new Error("Could not load the delivery link.");
  const codDue = o.payment_method === "cod" && !["paid", "refunded"].includes(o.payment_status)
    && !["delivered", "cancelled"].includes(o.status) ? o.total : 0;
  const orderHref = "/admin/orders/" + id;
  const customerLookup = !o.recipient_name && (o.customer_id || o.user_id) ? db.from("store_customers").select("full_name")
    .eq("store_id", storeId).eq(o.customer_id ? "id" : "user_id", o.customer_id ?? o.user_id).maybeSingle() : null;
  const amounts = orderAmounts(o);
  const amount = (value: number | null) => <bdi dir="ltr">{money(value, o.currency, lang)}</bdi>;
  const priceRows = <>
    <div><dt>{amounts.couponIncluded ? (isEn ? "Subtotal after coupon" : "مجموع المنتجات بعد خصم القسيمة") :
      (isEn ? "Subtotal" : "مجموع المنتجات")}</dt><dd>{amount(amounts.subtotal)}</dd></div>
    {(o.discount_amount > 0 || o.coupon_code) && <div><dt>{isEn ? "Coupon discount" : "خصم القسيمة"}
      {o.coupon_code && <> · <bdi dir="ltr">{o.coupon_code}</bdi></>}</dt><dd>{amount(o.discount_amount ? -o.discount_amount : 0)}</dd></div>}
    <div><dt>{t(lang, "shippingLabel")}</dt><dd>{amount(o.shipping_fee)}</dd></div>
    {o.wallet_discount > 0 && <div><dt>{isEn ? "Wallet credit used" : "خصم المحفظة"}</dt><dd>{amount(-o.wallet_discount)}</dd></div>}
    {!invoice && o.cashback_earned > 0 && <div><dt>{isEn ? "Cashback earned" : "الرصيد المكتسب"}</dt><dd>{amount(o.cashback_earned)}</dd></div>}
    <div className="ws-rule"><dt>{o.total == null && amounts.total != null ? (isEn ? "Calculated total" : "الإجمالي المحسوب") :
      (isEn ? "Total" : "الإجمالي")}</dt><dd>{amount(amounts.total)}</dd></div>
  </>;
  if (printDocument) {
    const [brand, logo, customer] = await Promise.all([
      db.from("store_settings").select("store_name").eq("store_id", storeId).maybeSingle(),
      db.from("store_app_builds").select("icon_url").eq("store_id", storeId)
        .not("icon_url", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      customerLookup,
    ]);
    const name = localizedText(lang, brand.data?.store_name || activeStore.name_ar, activeStore.name_en);
    const title = invoice ? (isEn ? "Invoice" : "فاتورة") : (isEn ? "Shipping label" : "بوليصة الشحن");
    return (
      <article className="order-document" dir={isEn ? "ltr" : "rtl"}>
        <nav className="document-actions">
          <Link href={orderHref}>{isEn ? "Back to order" : "العودة إلى الطلب"}</Link>
          <PrintButton />
        </nav>
        <header>
          {logo.data?.icon_url && isSafeHttpUrl(logo.data.icon_url) &&
            <Image unoptimized src={logo.data.icon_url} width={56} height={56} alt="" />}
          <strong>{name}</strong>
          <h1>{title}</h1>
        </header>
        <p>{t(lang, "orderNumberLabel")} <bdi dir="ltr">{id}</bdi> · <bdi dir="ltr">{date(o.created_at, lang)}</bdi></p>
        <section>
          <h2>{t(lang, "shippingAddressLabel")}</h2>
          {(o.recipient_name || customer?.data?.full_name) && <strong>{o.recipient_name || customer?.data?.full_name}</strong>}
          <p>{o.shipping_address}</p>
          {o.phone && <p>{t(lang, "deliveryPhone")} · <bdi dir="ltr">{o.phone}</bdi></p>}
          {o.shipping_carrier && <p>{localizeCarrierLabel(o.shipping_carrier, lang)}</p>}
          {o.tracking_number && <p>{t(lang, "trackingNumber")} · <bdi dir="ltr">{o.tracking_number}</bdi></p>}
          {o.tracking_url && isSafeHttpUrl(o.tracking_url) &&
            <p>{t(lang, "trackShipment")} · <a href={o.tracking_url} dir="ltr"><bdi dir="ltr">{o.tracking_url}</bdi></a></p>}
        </section>
        <table>
          <thead><tr><th>{t(lang, "adminProductCol")}</th><th>{t(lang, "adminQtyCol")}</th>
            {invoice && <><th>{t(lang, "adminUnitPriceCol")}</th><th>{isEn ? "Amount" : "المبلغ"}</th></>}
          </tr></thead>
          <tbody>{o.order_items.map((item: { id: string; product_name: string; quantity: number;
            unit_price: number; size: string | null; color: string | null }) => (
            <tr key={item.id}>
              <td>{item.product_name} <small>{[item.size, item.color && translateColor(item.color, lang)].filter(Boolean).join(" / ")}</small></td>
              <td><bdi dir="ltr">{item.quantity}</bdi></td>
              {invoice && <><td>{amount(item.unit_price)}</td><td>{amount(item.quantity * item.unit_price)}</td></>}
            </tr>
          ))}</tbody>
        </table>
        {invoice && <dl className="ws-invoice-totals">{priceRows}</dl>}
        <p className="document-cod">{isEn ? "COD amount due" : "المبلغ المطلوب تحصيله"} · {amount(codDue)}</p>
      </article>
    );
  }
  const recipient = o.recipient_name || (await customerLookup)?.data?.full_name;
  const linkedReturn = returnRes?.data?.[0] ? normalizeReturnRecord(returnRes.data[0]) : null;
  const options = checked(await db.rpc("allowed_order_transitions", {
    p_status: o.status, p_method: o.payment_method,
    p_payment: o.payment_status, p_priced: o.subtotal !== null
  })) as string[];
  const columns = isEn ? ["Item", "Quantity", "Unit price", "Amount"] : ["المنتج", "الكمية", "سعر الوحدة", "المبلغ"];
  const methodNames: Record<string, string> = { cod: isEn ? "Cash on delivery" : "الدفع عند الاستلام",
    coupon: isEn ? "Coupon" : "كوبون", wallet: isEn ? "Wallet" : "المحفظة", paymob_card: isEn ? "Bank card" : "بطاقة بنكية", paymob_wallet: isEn ? "Mobile wallet" : "محفظة إلكترونية"
  };
  const paymentLabel = orderLabels(o, isEn).payment;
  return <div className={drawer ? "ws-order-record" : "ws-page ws-order-record"}>
    {!drawer && <><Link className="ws-text-link" href="/admin/orders"><ArrowLeft className="pt-directional" size={15}/>{isEn ? "Orders" : "الطلبات"}</Link>
      <WorkspaceHeading title={<>{isEn ? "Order" : "طلب"} <bdi dir="ltr">#{id.slice(0, 8)}</bdi></>} /><Notice result={resultCode} /></>}
    <section className="ws-box ws-stack">
      <div className="ws-section-line"><StatusDot status={o.status}>{orderStatusLabel(o.status, lang)}</StatusDot><small><bdi dir="ltr">{date(o.created_at, lang)}</bdi></small></div>
      <h3>{isEn ? "Customer and delivery" : "العميل والتوصيل"}</h3>
      <div className="ws-cell-stack"><strong dir="auto">{recipient || (o.user_id ? (isEn ? "Registered customer" : "عميل مسجّل") : (isEn ? "Guest customer" : "عميل زائر"))}</strong>
        {o.phone && <a href={"tel:" + o.phone}><bdi dir="ltr">{o.phone}</bdi></a>}
        <p dir="auto">{o.shipping_address}</p>
        {o.lat != null && o.lng != null && <a className="ws-text-link" href={`https://www.google.com/maps/search/?api=1&query=${o.lat},${o.lng}`} target="_blank" rel="noreferrer">
          <MapPin size={14}/>{isEn ? "Open delivery pin" : "فتح موقع التوصيل"}</a>}</div>
      <dl className="ws-facts">
        {o.shipping_carrier && <div><dt>{isEn ? "Carrier" : "شركة الشحن"}</dt><dd>{localizeCarrierLabel(o.shipping_carrier, lang)}</dd></div>}
        {o.tracking_number && <div><dt>{t(lang, "trackingNumber")}</dt><dd><bdi dir="ltr">{o.tracking_number}</bdi></dd></div>}
        {o.shipped_at && <div><dt>{t(lang, "shippedOn")}</dt><dd><bdi dir="ltr">{date(o.shipped_at, lang)}</bdi></dd></div>}
        {o.delivered_at && <div><dt>{t(lang, "deliveryDeliveredAt")}</dt><dd><bdi dir="ltr">{date(o.delivered_at, lang)}</bdi></dd></div>}
        {o.courier_note && <div><dt>{isEn ? "Courier note" : "ملاحظة المندوب"}</dt><dd dir="auto">{o.courier_note}</dd></div>}
      </dl>
      {o.tracking_url && isSafeHttpUrl(o.tracking_url) && <a className="ws-text-link" href={o.tracking_url} target="_blank" rel="noreferrer">{t(lang, "trackShipment")}</a>}
    </section>
    <section className="ws-sheet"><div className="ws-section-head"><h3>{t(lang, "adminOrderItems")}</h3></div>
      {o.order_items.length ? <WorkspaceTable columns={columns} caption={t(lang, "adminOrderItems")}>
        {o.order_items.map(item => <tr key={item.id} role="row">
          <DataCell><div className="ws-cell-stack"><strong dir="auto">{item.product_name}</strong>
            <small>{[item.size, item.color && translateColor(item.color, lang)].filter(Boolean).join(" / ")}</small></div></DataCell>
          <DataCell label={columns[1]}><bdi dir="ltr">{item.quantity}</bdi></DataCell><DataCell label={columns[2]}>{amount(item.unit_price)}</DataCell>
          <DataCell label={columns[3]}>{amount(item.unit_price * item.quantity)}</DataCell></tr>)}</WorkspaceTable> :
        <p className="ws-order-summary">{isEn ? "No items were recorded for this order." : "لم تُسجّل منتجات في هذا الطلب."}</p>}
      {o.payment_review && <p role="status">{o.payment_review === "late_capture_after_cod"
        ? (isEn ? "Online payment arrived after the switch to cash. Check any cash already collected." : "وصل الدفع الإلكتروني بعد التحويل للنقد. راجع أي مبلغ حُصّل نقداً.")
        : (isEn ? "Review this payment and any refund owed." : "راجع هذه الدفعة وأي مبلغ مستحق للاسترداد.")}</p>}
      <dl className="ws-facts ws-order-summary">
        {priceRows}
        <div><dt>{t(lang, "paymentMethodLabel")}</dt><dd>{methodNames[o.payment_method] ?? o.payment_method}</dd></div>
        {o.payment_status && <div><dt>{isEn ? "Payment status" : "حالة الدفع"}</dt><dd><StatusDot status={o.payment_status}>{paymentLabel}</StatusDot></dd></div>}
        {o.payment_method === "cod" && <div><dt>{isEn ? "Amount to collect" : "المبلغ المطلوب تحصيله"}</dt><dd>{amount(codDue)}</dd></div>}
      </dl>
    </section>
    <section className="ws-box ws-stack"><h3>{isEn ? "Fulfillment" : "تجهيز الطلب"}</h3>
      {!options.length && o.status !== "shipped" && <p>{isEn ? "There are no further status changes for this order." : "اكتملت خطوات معالجة هذا الطلب."}</p>}
      <OrderStatusForm drawerStore={drawer ? storeId : undefined} orderId={id} currentStatus={o.status} options={options}
        shippingCarrier={o.shipping_carrier} trackingNumber={o.tracking_number} trackingUrl={o.tracking_url}
        courierNote={o.courier_note} deliveryToken={tokenRes?.data} shippingAddress={o.shipping_address} phone={o.phone}
        totalLabel={money(codDue, o.currency, lang)} /></section>
    {linkedReturn && <section className="ws-box ws-stack"><h3>{isEn ? "Return or exchange" : "الإرجاع أو الاستبدال"}</h3>
      <div className="ws-section-line"><StatusDot status={linkedReturn.status}>{returnStatusMeta(linkedReturn.status, lang).label}</StatusDot>
        {amount(linkedReturn.refund_amount)}</div><Link className="ws-text-link" href="/admin/returns">{isEn ? "Manage return" : "إدارة طلب الإرجاع"}</Link></section>}
    <nav className="ws-actions" aria-label={isEn ? "Order documents" : "مستندات الطلب"}>
      <Link className="ws-button" href={orderHref + "?print=invoice"} prefetch={false}><FileText size={14}/>{isEn ? "Invoice" : "فاتورة"}</Link>
      <Link className="ws-button" href={orderHref + "?print=label"} prefetch={false}>{isEn ? "Shipping label" : "بوليصة الشحن"}</Link>
      {drawer && <Link className="ws-text-link" href={orderHref}>{isEn ? "Full order" : "صفحة الطلب"}<ArrowRight className="pt-directional" size={14}/></Link>}
    </nav>
  </div>;
}
