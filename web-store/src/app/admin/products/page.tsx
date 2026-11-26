import { SubmitButton } from "@/components/submit-button";
import Link from "next/link";
import Image from "next/image";
import { Package, Plus, Zap } from "lucide-react";
import { checked, requireAdmin } from "@/lib/db";
import { adminDb } from "@/lib/supabase/admin";
import { money } from "@/lib/brand";
import { photo, searchPattern } from "@/lib/shop";
import {
  getFlashSavingsPercent,
  isFlashSaleActive,
  resolveEffectivePrice,
} from "@/lib/flash-sale";
import { localizedText, t } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { pagination } from "@/lib/workflow";
import { saveCategory, deleteCategory, deleteProduct } from "../mutations";
import { Empty, Notice, Pager } from "../ui";
import {
  AdminProductForm,
  type AdminCategoryItem,
  type AdminProductItem,
} from "./product-form";

export default async function Products({
  searchParams,
}: PageProps<"/admin/products">) {
  const [params, lang, { db, storeId, activeStore }] = await Promise.all([
    searchParams,
    getServerLang(),
    requireAdmin(),
  ]);
  const secureDb = adminDb();
  const { from, to, page } = pagination(params.page);
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const base = q ? "/admin/products?" + new URLSearchParams({ q }) : "/admin/products";
  let query = secureDb
    .from("products")
    .select(
      "id,name,name_en,slug,description,description_en,price,cost_price,old_price,flash_sale_price,flash_sale_starts_at,flash_sale_ends_at,stock,category_id,sizes,colors,image_path,image_paths,specifications,is_active",
      { count: "exact" },
    )
    .eq("store_id", storeId);
  if (q) {
    const pattern = JSON.stringify(searchPattern(q));
    query = query.or(["name", "name_en", "slug"].map((field) => field + ".ilike." + pattern).join(","));
  }
  const [productResult, tenantCount] = await Promise.all([
    query.order("name").order("id").range(from, to),
    q ? secureDb.from("products").select("id", { count: "exact", head: true }).eq("store_id", storeId) : null,
  ]);
  if (tenantCount?.error) throw new Error("Could not load catalog count");
  const products: AdminProductItem[] = checked(productResult);
  const totalProductsCount = tenantCount?.count ?? productResult.count ?? products.length;
  const atLimit = totalProductsCount >= activeStore.max_products;
  const categories: AdminCategoryItem[] = [];
  for (let offset = 0; ; offset += 200) {
    const batch = checked(
      await db
        .from("categories")
        .select("id,name,name_en,slug")
        .eq("store_id", storeId)
        .order("name")
        .order("id")
        .range(offset, offset + 199),
    );
    categories.push(...batch);
    if (batch.length < 200) break;
  }

  return (
    <>
      <div className="row" style={{ flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <h1 style={{ marginBottom: 0 }}>{t(lang, "adminCatalogHeading")}</h1>
        <span
          style={{
            fontSize: "0.84rem",
            fontWeight: 700,
            padding: "0.3rem 0.75rem",
            borderRadius: "999px",
            background: atLimit
              ? "rgba(220, 38, 38, 0.1)"
              : "color-mix(in srgb, var(--primary) 10%, transparent)",
            color: atLimit ? "#b91c1c" : "var(--primary)",
          }}
        >
          {lang === "en"
            ? `Products: ${totalProductsCount} / ${activeStore.max_products}`
            : `المنتجات: ${totalProductsCount} / ${activeStore.max_products}`}
        </span>
      </div>
      <Notice result={params.result} />
      <details className="card">
        <summary>
          {t(lang, "adminManageCategories")} <span>{categories.length}</span>
        </summary>
        <form action={saveCategory} className="inline">
          <label>
            {t(lang, "adminCategoryNameAr")}
            <input name="name" required />
          </label>
          <label>
            {t(lang, "adminCategoryNameEn")}
            <input
              name="name_en"
              dir="ltr"
              placeholder={
                lang === "en" ? "e.g. Men's Fashion" : "مثال: أزياء رجالي"
              }
            />
          </label>
          <label>
            {t(lang, "adminSlug")}
            <input name="slug" dir="ltr" required />
          </label>
          <SubmitButton>{t(lang, "adminAddBtn")}</SubmitButton>
        </form>
        {categories.map((c) => (
          <details key={c.id}>
            <summary>{localizedText(lang, c.name, c.name_en)}</summary>
            <form className="inline" action={saveCategory}>
              <input type="hidden" name="id" value={c.id} />
              <label>
                {t(lang, "adminCategoryNameAr")}
                <input name="name" defaultValue={c.name} required />
              </label>
              <label>
                {t(lang, "adminCategoryNameEn")}
                <input
                  name="name_en"
                  dir="ltr"
                  defaultValue={c.name_en ?? ""}
                />
              </label>
              <label>
                {t(lang, "adminSlug")}
                <input name="slug" dir="ltr" defaultValue={c.slug} required />
              </label>
              <SubmitButton>{t(lang, "adminSaveBtn")}</SubmitButton>
              <SubmitButton className="danger" formAction={deleteCategory}>
                {t(lang, "adminDeleteCategory")}
              </SubmitButton>
            </form>
          </details>
        ))}
      </details>
      <details className="card">
        <summary>
          <span className="with-icon">
            <Plus size={18} /> {t(lang, "adminAddProduct")}
          </span>
        </summary>
        {categories.length ? (
          <AdminProductForm categories={categories} query={q} page={page} />
        ) : (
          <p>{lang === "en" ? "Add a category first." : "أضف فئة أولاً."}</p>
        )}
      </details>
      <section className="card">
        <h2>{t(lang, "adminProductsDirectory")}</h2>
        <form action="/admin/products" className="inline">
          <label>{lang === "en" ? "Product name or slug" : "اسم المنتج أو الرابط المختصر"}
            <input type="search" name="q" maxLength={100} defaultValue={q} dir="auto" />
          </label>
          <SubmitButton>{lang === "en" ? "Search" : "بحث"}</SubmitButton>
          {q && <Link href="/admin/products">{lang === "en" ? "Clear search" : "مسح البحث"}</Link>}
        </form>
        {!products.length && (
          <Empty>
            {q ? t(lang, "noMatchingProducts") : lang === "en" ? "No products yet." : "لا توجد منتجات."}
          </Empty>
        )}
        {products.map((p) => {
          const flashActive = isFlashSaleActive(p);
          const flashPct = getFlashSavingsPercent(p);
          const effPrice = resolveEffectivePrice(p);
          return (
            <details key={p.id}>
              <summary>
                <span className="with-icon">
                  {p.image_path ? (
                    <Image
                      unoptimized
                      width={48}
                      height={48}
                      className="thumb"
                      alt=""
                      src={photo(p.image_path) ?? ""}
                    />
                  ) : (
                    <Package size={24} />
                  )}{" "}
                  <span>{localizedText(lang, p.name, p.name_en)}</span>
                  {flashActive && (
                    <span className="admin-flash-pill">
                      <Zap size={12} aria-hidden="true" />
                      <span>
                        {lang === "en"
                          ? `Flash${flashPct ? ` -${flashPct}%` : ""}`
                          : `عرض مؤقت${flashPct ? ` -${flashPct}٪` : ""}`}
                      </span>
                    </span>
                  )}
                </span>
                <small>
                  {flashActive ? (
                    <>
                      <strong className="admin-flash-price-text">
                        {money(effPrice, undefined, lang)}
                      </strong>{" "}
                      <del>{money(p.price, undefined, lang)}</del>
                    </>
                  ) : (
                    money(p.price, undefined, lang)
                  )}
                  {Number(p.cost_price ?? 0) > 0
                    ? ` · ${t(lang, "adminCost")} ${money(Number(p.cost_price), undefined, lang)}`
                    : ""}{" "}
                  · {t(lang, "adminStock")} {p.stock} ·{" "}
                  {p.is_active
                    ? t(lang, "adminPublished")
                    : t(lang, "adminDraft")}
                </small>
              </summary>
              <AdminProductForm p={p} categories={categories} query={q} page={page} />
              <details>
                <summary>{t(lang, "adminDeleteProduct")}</summary>
                <form action={deleteProduct}>
                  <input type="hidden" name="q" value={q} />
                  <input type="hidden" name="page" value={page} />
                  <input type="hidden" name="id" value={p.id} />
                  <SubmitButton className="danger">
                    {t(lang, "adminConfirmDelete")}
                  </SubmitButton>
                </form>
              </details>
            </details>
          );
        })}
        <Pager
          page={page}
          base={base}
          count={productResult.count ?? 0}
        />
      </section>
    </>
  );
}
