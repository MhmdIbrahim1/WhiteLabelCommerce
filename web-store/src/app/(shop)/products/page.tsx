import Link from "next/link";
import { Sparkles } from "lucide-react";
import { serverDb, checked } from "@/lib/db";
import {
  categories,
  productFields,
  settings,
  type Product,
} from "@/lib/shop";
import { storeHref } from "@/lib/tenant";
import { localizedText, t } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { pagination } from "@/lib/workflow";
import { Grid } from "@/components/shop/cards";

type SearchProductRow = Product & {
  rank?: number;
  match_type?: string | null;
};

export default async function Catalog({
  searchParams,
}: PageProps<"/products">) {
  const params = await searchParams;
  const read = (k: string) =>
    typeof params[k] === "string" ? String(params[k]).trim() : "";
  const q = read("q"),
    category = read("category"),
    min = read("min"),
    max = read("max");
  const { from, to, page } = pagination(params.page);
  const db = await serverDb();
  const [cats, s] = await Promise.all([categories(), settings()]);
  const lang = await getServerLang(s.uiConfig.defaultLanguage);
  const validCategory =
    category && cats.some((c) => c.id === category) ? category : null;

  let rows: SearchProductRow[] = [];
  let totalCount = 0;
  let searchBannerKind: "closest" | "spec" | null = null;

  if (q) {
    const hasPriceBounds =
      (min && Number.isFinite(+min)) || (max && Number.isFinite(+max));
    const pageSize = to - from + 1;

    if (hasPriceBounds) {
      const fast = await db.rpc("search_products_fast", {
        p_store_id: s.storeId,
        p_query: q.slice(0, 100),
        p_limit: 50,
        p_category_id: validCategory,
        p_offset: 0,
      });
      const matched = (checked(fast) as SearchProductRow[]).filter((p) => {
        if (min && Number.isFinite(+min) && Number(p.price) < +min)
          return false;
        if (max && Number.isFinite(+max) && Number(p.price) > +max)
          return false;
        return true;
      });
      totalCount = matched.length;
      rows = matched.slice(from, to + 1);
    } else {
      const fast = await db.rpc("search_products_fast", {
        p_store_id: s.storeId,
        p_query: q.slice(0, 100),
        p_limit: pageSize + 1,
        p_category_id: validCategory,
        p_offset: from,
      });
      const fetched = checked(fast) as SearchProductRow[];
      const hasMore = fetched.length > pageSize;
      rows = hasMore ? fetched.slice(0, pageSize) : fetched;
      totalCount = from + rows.length + (hasMore ? 1 : 0);
    }

    if (rows.length > 0) {
      const hasDirect = rows.some(
        (p) => p.match_type === "exact" || p.match_type === "synonym",
      );
      const hasSpec = rows.some((p) => p.match_type === "spec");
      if (!hasDirect) {
        searchBannerKind = hasSpec ? "spec" : "closest";
      }
    }
  } else {
    let query = db
      .from("products")
      .select(productFields, { count: "exact" })
      .eq("store_id", s.storeId)
      .eq("is_active", true);
    if (validCategory) query = query.eq("category_id", validCategory);
    if (min && Number.isFinite(+min)) query = query.gte("price", +min);
    if (max && Number.isFinite(+max)) query = query.lte("price", +max);
    const result = await query.order("name").order("id").range(from, to);
    rows = checked(result) as SearchProductRow[];
    totalCount = result.count ?? rows.length;
  }

  const href = (n: number) =>
    storeHref(
      s.basePath,
      "/products?" +
        new URLSearchParams({ q, category, min, max, page: String(n) }),
    );

  return (
    <>
      <div className="split section-head">
        <div>
          <span className="section-kicker">{t(lang, "kickerStore")}</span>
          <h1>
            {q
              ? `${t(lang, "searchResultsFor")} "${q}"`
              : t(lang, "allProductsChip")}
          </h1>
        </div>
        {q && (
          <small>
            {totalCount} {t(lang, "matchingProducts")}
          </small>
        )}
      </div>
      <form className="filters panel">
        <label>
          {t(lang, "filterSearch")}
          <input
            name="q"
            defaultValue={q}
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

      {q && rows.length === 0 ? (
        <div className="panel search-empty-card">
          <p>
            <strong>
              {t(lang, "navSearchEmpty")} &quot;{q}&quot;.
            </strong>
          </p>
          <p className="search-empty-hint">{t(lang, "searchTryAgainHint")}</p>
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
          <Link className="section-more-link" href={href(page - 1)}>
            {t(lang, "prevPage")}
          </Link>
        )}
        {to + 1 < totalCount && (
          <Link className="section-more-link" href={href(page + 1)}>
            {t(lang, "nextPage")}
          </Link>
        )}
      </div>
    </>
  );
}
