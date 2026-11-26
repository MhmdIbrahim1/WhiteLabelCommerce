import Link from "next/link";
import { Check, Sparkles, X, Zap } from "lucide-react";
import { serverDb, checked } from "@/lib/db";
import {
  categories,
  settings,
  type Product,
} from "@/lib/shop";
import { notFound } from "next/navigation";
import { resolveActiveStore, storeHref } from "@/lib/tenant";
import { localizedText, t } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { pagination } from "@/lib/workflow";
import { type CatalogSortKey } from "@/lib/flash-sale";
import type { SearchMetadata } from "@/lib/smart-search";
import { SearchCorrection } from "@/components/shop/search-correction";
import { CatalogQueryInput } from "@/components/shop/catalog-query-input";
import { Grid } from "@/components/shop/cards";

type SearchProductRow = Product & {
  rank?: number;
  match_type?: string | null;
  created_at?: string | null;
};

type CatalogProductPageRow = SearchProductRow & SearchMetadata & {
  total_count: number | string;
};

const VALID_SORTS: CatalogSortKey[] = [
  "relevance",
  "price_asc",
  "price_desc",
  "rating",
  "newest",
];

export default async function Catalog({
  searchParams,
}: PageProps<"/products">) {
  const params = await searchParams;
  const read = (k: string) =>
    typeof params[k] === "string" ? String(params[k]).trim() : "";
  const q = read("q");
  const exact = read("exact") === "1";
  const category = read("category");
  const min = read("min");
  const max = read("max");
  const flashRaw = read("flash").toLowerCase();
  const inStockRaw = read("in_stock").toLowerCase();
  const sortRaw = read("sort").toLowerCase() as CatalogSortKey;

  const flashOnly = flashRaw === "1" || flashRaw === "true";
  const inStockOnly = inStockRaw === "1" || inStockRaw === "true";
  const sort: CatalogSortKey = VALID_SORTS.includes(sortRaw)
    ? sortRaw
    : "relevance";

  const minNum = min && Number.isFinite(+min) ? +min : null;
  const maxNum = max && Number.isFinite(+max) ? +max : null;
  const { from, to, page } = pagination(params.page);
  const [db, store] = await Promise.all([serverDb(), resolveActiveStore()]);
  if (!store) notFound();

  const categoryRows = categories();
  const selectedCategory = category
    ? categoryRows.then((rows) => rows.some((c) => c.id === category) ? category : null)
    : Promise.resolve(null);
  const fetchPage = (categoryId: string | null) => db.rpc("catalog_products_page", {
    p_store_id: store.id,
    p_exact_query: exact,
    p_query: q.slice(0, 100),
    p_category_id: categoryId,
    p_min_price: minNum,
    p_max_price: maxNum,
    p_in_stock: inStockOnly,
    p_flash_only: flashOnly,
    p_sort: sort,
    p_limit: to - from + 1,
    p_offset: from,
  });
  const [cats, s, validCategory, result] = await Promise.all([
    categoryRows, settings(), selectedCategory, selectedCategory.then(fetchPage),
  ]);
  const lang = await getServerLang(s.uiConfig.defaultLanguage);
  const isEn = lang === "en";
  const rows = checked(result) as CatalogProductPageRow[];
  const totalCount = Number(rows[0]?.total_count ?? 0);
  let searchBannerKind: "closest" | "spec" | null = null;

  const correction = rows[0]?.was_auto_corrected ? rows[0] : null;
  if (q && !exact && !correction && rows.length > 0) {
    const hasDirect = rows.some(
      (p) => p.match_type === "exact" || p.match_type === "synonym",
    );
    const hasSpec = rows.some((p) => p.match_type === "spec");
    if (!hasDirect) {
      searchBannerKind = hasSpec ? "spec" : "closest";
    }
  }

  const buildFilterHref = (
    overrides: Partial<{
      q: string;
      exact: boolean;
      category: string;
      min: string;
      max: string;
      flash: boolean;
      in_stock: boolean;
      sort: CatalogSortKey;
      page: number;
    }>,
  ) => {
    const next = new URLSearchParams();
    const nq = overrides.q !== undefined ? overrides.q : q;
    const nc = overrides.category !== undefined ? overrides.category : category;
    const nmin = overrides.min !== undefined ? overrides.min : min;
    const nmax = overrides.max !== undefined ? overrides.max : max;
    const nf = overrides.flash !== undefined ? overrides.flash : flashOnly;
    const nis = overrides.in_stock !== undefined ? overrides.in_stock : inStockOnly;
    const ns = overrides.sort !== undefined ? overrides.sort : sort;
    const np = overrides.page !== undefined ? overrides.page : 1;

    if (nq) next.set("q", nq);
    if (nq && (overrides.exact ?? exact)) next.set("exact", "1");
    if (nc) next.set("category", nc);
    if (nmin) next.set("min", nmin);
    if (nmax) next.set("max", nmax);
    if (nf) next.set("flash", "1");
    if (nis) next.set("in_stock", "1");
    if (ns && ns !== "relevance") next.set("sort", ns);
    if (np > 1) next.set("page", String(np));

    const qs = next.toString();
    return storeHref(s.basePath, qs ? `/products?${qs}` : "/products");
  };

  const hasAnyFilter = Boolean(
    q || validCategory || min || max || flashOnly || inStockOnly || sort !== "relevance",
  );

  return (
    <>
      <div className="split section-head">
        <div>
          <span className="section-kicker">
            {flashOnly
              ? isEn
                ? "Limited-Time Offers"
                : "عروض لفترة محدودة"
              : t(lang, "kickerStore")}
          </span>
          <h1>
            {q
              ? `${t(lang, "searchResultsFor")} "${q}"`
              : flashOnly
                ? isEn
                  ? "Flash Deals"
                  : "العروض المؤقتة"
                : t(lang, "allProductsChip")}
          </h1>
        </div>
        {(q || hasAnyFilter) && (
          <small>
            {totalCount} {t(lang, "matchingProducts")}
          </small>
        )}
      </div>

      <div
        className="catalog-quick-pills"
        role="region"
        aria-label={isEn ? "Quick filters" : "فلاتر سريعة"}
      >
        <Link
          href={buildFilterHref({ flash: !flashOnly, page: 1 })}
          className={`catalog-pill ${flashOnly ? "is-active is-flash" : ""}`}
        >
          <Zap size={14} aria-hidden="true" />
          <span>{isEn ? "Flash Deals Only" : "عروض مؤقتة فقط"}</span>
          {flashOnly && <X size={13} aria-hidden="true" />}
        </Link>

        <Link
          href={buildFilterHref({ in_stock: !inStockOnly, page: 1 })}
          className={`catalog-pill ${inStockOnly ? "is-active" : ""}`}
        >
          {inStockOnly && <Check size={14} aria-hidden="true" />}
          <span>{isEn ? "In Stock Only" : "متوفر فقط"}</span>
        </Link>

        <Link
          href={buildFilterHref({ category: "", page: 1 })}
          className={`catalog-pill ${!validCategory && !flashOnly ? "is-active" : ""}`}
        >
          <span>{t(lang, "filterAllCategories")}</span>
        </Link>

        {cats.slice(0, 6).map((c) => {
          const active = validCategory === c.id;
          return (
            <Link
              key={c.id}
              href={buildFilterHref({ category: active ? "" : c.id, page: 1 })}
              className={`catalog-pill ${active ? "is-active" : ""}`}
            >
              <span>{localizedText(lang, c.name, c.name_en)}</span>
            </Link>
          );
        })}

        {hasAnyFilter && (
          <Link
            href={storeHref(s.basePath, "/products")}
            className="catalog-pill is-clear"
          >
            <X size={13} aria-hidden="true" />
            <span>{isEn ? "Reset" : "مسح الكل"}</span>
          </Link>
        )}
      </div>

      <form className="filters panel" action={storeHref(s.basePath, "/products")}>
        {flashOnly && <input type="hidden" name="flash" value="1" />}
        {inStockOnly && <input type="hidden" name="in_stock" value="1" />}
        <label>
          {t(lang, "filterSearch")}
          <CatalogQueryInput
            key={JSON.stringify([q, exact])}
            query={q}
            exact={exact}
            placeholder={t(lang, "filterSearchPlaceholder")}
          />
        </label>
        <label>
          {t(lang, "filterCategory")}
          <select name="category" defaultValue={category}>
            <option value="">{t(lang, "filterAllCategories")}</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {localizedText(lang, c.name, c.name_en)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {isEn ? "Sort By" : "الترتيب حسب"}
          <select name="sort" defaultValue={sort}>
            <option value="relevance">
              {isEn ? "Relevance" : "الأكثر صلة"}
            </option>
            <option value="price_asc">
              {isEn ? "Price: Low to High" : "السعر: من الأقل للأعلى"}
            </option>
            <option value="price_desc">
              {isEn ? "Price: High to Low" : "السعر: من الأعلى للأقل"}
            </option>
            <option value="rating">
              {isEn ? "Top Rated" : "الأعلى تقييماً"}
            </option>
            <option value="newest">
              {isEn ? "Newest" : "الأحدث"}
            </option>
          </select>
        </label>
        <label>
          {t(lang, "filterPriceFrom")}
          <input
            type="number"
            min="0"
            step=".01"
            name="min"
            defaultValue={min}
          />
        </label>
        <label>
          {t(lang, "filterPriceTo")}
          <input
            type="number"
            min="0"
            step=".01"
            name="max"
            defaultValue={max}
          />
        </label>
        <button>{t(lang, "filterApply")}</button>
      </form>

      {correction?.corrected_from && (
        <SearchCorrection effective={correction.effective_query} original={correction.corrected_from}
          isEn={isEn} exactHref={buildFilterHref({ q: correction.corrected_from, exact: true })} />
      )}
      {q && searchBannerKind && (
        <div className="search-closest-banner" role="status">
          <Sparkles size={16} aria-hidden="true" />
          <span>
            {searchBannerKind === "spec"
              ? t(lang, "searchSpecMatches")
              : t(lang, "searchClosestMatches")}{" "}
            <strong>&quot;{q}&quot;</strong>
          </span>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="panel shop-empty-state">
          <p>
            <strong>
              {q
                ? `${t(lang, "navSearchEmpty")} "${q}".`
                : flashOnly
                  ? isEn
                    ? "No active flash deals match your current filters."
                    : "لا توجد عروض مؤقتة نشطة مطابقة للفلاتر الحالية."
                  : t(lang, "noMatchingProducts")}
            </strong>
          </p>
          <p className="search-empty-hint">
            {isEn
              ? "Try adjusting your filters or browsing all active products."
              : "جرّب تعديل خيارات التصفية أو استعراض جميع المنتجات المتاحة."}
          </p>
          {hasAnyFilter && (
            <Link
              href={storeHref(s.basePath, "/products")}
              className="section-more-link"
              style={{ marginTop: "0.75rem" }}
            >
              {t(lang, "allProductsChip")}
            </Link>
          )}
        </div>
      ) : (
        <Grid
          rows={rows}
          currency={s.currency}
          lang={lang}
          basePath={s.basePath}
        />
      )}

      <div className="actions" style={{ marginTop: "1.5rem" }}>
        {page > 1 && (
          <Link className="section-more-link" href={buildFilterHref({ page: page - 1 })}>
            {t(lang, "prevPage")}
          </Link>
        )}
        {to + 1 < totalCount && (
          <Link className="section-more-link" href={buildFilterHref({ page: page + 1 })}>
            {t(lang, "nextPage")}
          </Link>
        )}
      </div>
    </>
  );
}
