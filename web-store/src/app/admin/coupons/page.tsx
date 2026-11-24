import { TicketPercent, Plus, Trash2, Power } from "lucide-react";
import { checked, requireAdmin } from "@/lib/db";
import brand, { date, money } from "@/lib/brand";
import { getServerLang } from "@/lib/i18n-server";
import { saveCoupon, toggleCoupon, deleteCoupon } from "../mutations";
import { Empty, Notice } from "../ui";

type CouponRow = {
  id: string;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  min_order_amount: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
};

export default async function AdminCouponsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ db }, lang] = await Promise.all([requireAdmin(), getServerLang()]);
  const isEn = lang === "en";
  const [params, settingsRes, couponsRes] = await Promise.all([
    searchParams,
    db
      .from("store_settings")
      .select("currency")
      .eq("id", true)
      .single<{ currency: string }>(),
    db
      .from("coupons")
      .select(
        "id,code,discount_type,discount_value,min_order_amount,max_uses,used_count,expires_at,is_active,created_at",
      )
      .order("created_at", { ascending: false }),
  ]);

  const currency = settingsRes.data?.currency || brand.currency;
  const coupons = (checked(couponsRes) as CouponRow[]) ?? [];
  const nowIso = new Date().toISOString();

  return (
    <>
      <h1>{isEn ? "Promo Coupons & Discounts" : "كوبونات الخصم والعروض"}</h1>
      <Notice result={params.result} />

      <details className="card" open>
        <summary>
          <span className="with-icon">
            <Plus size={18} />{" "}
            {isEn ? "Create New Promo Coupon" : "إنشاء كوبون خصم جديد"}
          </span>
        </summary>
        <form action={saveCoupon} className="fields">
          <label>
            {isEn ? "Coupon Code (e.g. WELCOME15)" : "كود الكوبون (مثال: WELCOME15)"}
            <input
              name="code"
              dir="ltr"
              placeholder="WELCOME15"
              required
              minLength={2}
              maxLength={40}
            />
          </label>
          <label>
            {isEn ? "Discount Type" : "نوع الخصم"}
            <select name="discount_type" defaultValue="percent">
              <option value="percent">
                {isEn ? "Percentage (%)" : "نسبة مئوية (%)"}
              </option>
              <option value="fixed">
                {isEn ? `Fixed Amount (${currency})` : `مبلغ ثابت (${currency})`}
              </option>
            </select>
          </label>
          <label>
            {isEn ? "Discount Value" : "قيمة الخصم"}
            <input
              type="number"
              name="discount_value"
              min="1"
              step="0.01"
              placeholder="15"
              required
            />
          </label>
          <label>
            {isEn ? `Minimum Order (${currency})` : `الحد الأدنى للطلب (${currency})`}
            <input
              type="number"
              name="min_order_amount"
              min="0"
              step="0.01"
              defaultValue="0"
            />
          </label>
          <label>
            {isEn
              ? "Max Uses (leave blank for unlimited)"
              : "الحد الأقصى للاستخدام (اتركه فارغاً لغير محدود)"}
            <input type="number" name="max_uses" min="1" step="1" />
          </label>
          <label>
            {isEn ? "Expiry Date (optional)" : "تاريخ الانتهاء (اختياري)"}
            <input type="datetime-local" name="expires_at" dir="ltr" />
          </label>
          <label className="check wide">
            <input type="checkbox" name="is_active" defaultChecked />{" "}
            {isEn ? "Activate coupon immediately" : "تفعيل الكوبون فوراً"}
          </label>
          <button>
            <TicketPercent size={16} /> {isEn ? "Save Coupon" : "حفظ الكوبون"}
          </button>
        </form>
      </details>

      <section className="card">
        <h2>
          {isEn
            ? `Active & Saved Coupons (${coupons.length})`
            : `الكوبونات المسجلة (${coupons.length})`}
        </h2>
        {coupons.length === 0 ? (
          <Empty>
            {isEn
              ? "No coupons yet. Create your first coupon above."
              : "لا توجد كوبونات خصم بعد. أنشئ أول كوبون من الأعلى."}
          </Empty>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>{isEn ? "Code" : "الكود"}</th>
                  <th>{isEn ? "Discount" : "الخصم"}</th>
                  <th>{isEn ? "Min Order" : "الحد الأدنى"}</th>
                  <th>{isEn ? "Usage" : "الاستخدام"}</th>
                  <th>{isEn ? "Expires" : "تاريخ الانتهاء"}</th>
                  <th>{isEn ? "Status" : "الحالة"}</th>
                  <th>{isEn ? "Actions" : "إجراءات"}</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => {
                  const expired =
                    c.expires_at !== null && c.expires_at < nowIso;
                  return (
                    <tr key={c.id}>
                      <td>
                        <strong className="code">{c.code}</strong>
                      </td>
                      <td>
                        <strong>
                          {c.discount_type === "percent"
                            ? `${c.discount_value}%`
                            : money(c.discount_value, currency, lang)}
                        </strong>
                      </td>
                      <td>{money(c.min_order_amount, currency, lang)}</td>
                      <td>
                        {c.used_count} / {c.max_uses ?? "∞"}
                      </td>
                      <td>
                        {c.expires_at
                          ? date(c.expires_at, lang)
                          : isEn
                            ? "No expiry"
                            : "بلا انتهاء"}
                      </td>
                      <td>
                        <span
                          className={
                            "badge " +
                            (expired
                              ? "cancelled"
                              : c.is_active
                                ? "delivered"
                                : "pending")
                          }
                        >
                          {expired
                            ? isEn
                              ? "Expired"
                              : "منتهي"
                            : c.is_active
                              ? isEn
                                ? "Active"
                                : "مفعّل"
                              : isEn
                                ? "Paused"
                                : "متوقف"}
                        </span>
                      </td>
                      <td>
                        <div className="order-quick-actions">
                          <form action={toggleCoupon} style={{ margin: 0 }}>
                            <input type="hidden" name="id" value={c.id} />
                            <input
                              type="hidden"
                              name="next_active"
                              value={c.is_active ? "false" : "true"}
                            />
                            <button
                              type="submit"
                              className="btn-outline-admin"
                            >
                              <Power size={14} />
                              {c.is_active
                                ? isEn
                                  ? "Pause"
                                  : "إيقاف"
                                : isEn
                                  ? "Enable"
                                  : "تفعيل"}
                            </button>
                          </form>
                          <form action={deleteCoupon} style={{ margin: 0 }}>
                            <input type="hidden" name="id" value={c.id} />
                            <button
                              type="submit"
                              className="btn-outline-admin danger"
                            >
                              <Trash2 size={14} /> {isEn ? "Delete" : "حذف"}
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
