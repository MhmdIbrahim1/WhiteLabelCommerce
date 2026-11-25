import Link from "next/link";
import { Heart, LogIn, ArrowLeft, ArrowRight } from "lucide-react";
import { serverDb } from "@/lib/db";
import { photo, productFields, settings, type Product } from "@/lib/shop";
import { getServerLang } from "@/lib/i18n-server";
import { storeHref } from "@/lib/tenant";
import { WishlistGrid, type WishlistCardProduct } from "@/components/shop/wishlist-grid";

type WishlistProduct = Product & { is_active?: boolean };

type WishlistRow = {
  id: string;
  product_id: string;
  created_at: string;
  products: WishlistProduct | WishlistProduct[] | null;
};

export default async function WishlistPage() {
  const [db, s] = await Promise.all([serverDb(), settings()]);
  const [lang, authRes] = await Promise.all([
    getServerLang(s.uiConfig.defaultLanguage),
    db.auth.getUser(),
  ]);
  const isEn = lang === "en";
  const ArrowIcon = isEn ? ArrowRight : ArrowLeft;
  const user = authRes.data.user;
  const href = (path: string) => storeHref(s.basePath, path);

  if (!user) {
    return (
      <section className="wishlist-page-shell">
        <div className="panel wishlist-empty-card shop-animate">
          <span className="wishlist-empty-icon" aria-hidden="true">
            <Heart size={28} strokeWidth={1.6} />
          </span>
          <h1>{isEn ? "Your Cloud Wishlist" : "قائمة المفضلة السحابية"}</h1>
          <p>
            {isEn
              ? "Sign in to save your favorite items across web and mobile, and get notified on price drops or restocks."
              : "سجّل الدخول لحفظ منتجاتك المفضلة ومزامنتها بين الموقع والتطبيق، واستقبال تنبيهات انخفاض السعر وتوفر المخزون."}
          </p>
          <div className="actions" style={{ justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              href={`/login?next=${encodeURIComponent(href("/wishlist"))}`}
              className="cta"
            >
              <LogIn size={16} />
              <span>{isEn ? "Sign In" : "تسجيل الدخول"}</span>
            </Link>
            <Link href={href("/products")} className="section-more-link">
              <span>{isEn ? "Browse Products" : "تصفّح المنتجات"}</span>
              <ArrowIcon size={15} />
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const { data } = await db
    .from("wishlists")
    .select(`id,product_id,created_at,products(${productFields},is_active)`)
    .eq("store_id", s.storeId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const rows: WishlistCardProduct[] = ((data ?? []) as WishlistRow[])
    .map((row) => (Array.isArray(row.products) ? row.products[0] : row.products))
    .filter((p): p is WishlistProduct => Boolean(p && p.is_active !== false))
    .map((p) => ({
      ...p,
      image_url: photo(p.image_path),
    }));

  return (
    <section className="wishlist-page-shell">
      <div className="split section-head">
        <div>
          <span className="section-kicker">
            {isEn ? "Saved Items" : "مختاراتك المحفوظة"}
          </span>
          <h1>{isEn ? "My Wishlist" : "المفضلة"}</h1>
        </div>
        <Link href={href("/products")} className="section-more-link">
          <span>{isEn ? "Continue Shopping" : "متابعة التسوّق"}</span>
          <ArrowIcon size={15} />
        </Link>
      </div>

      <WishlistGrid
        initialProducts={rows}
        currency={s.currency}
        basePath={s.basePath}
      />
    </section>
  );
}
