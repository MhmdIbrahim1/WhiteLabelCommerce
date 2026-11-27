import Link from "next/link";
import { Search } from "lucide-react";
import { checked, requireAdmin } from "@/lib/db";
import { getServerLang } from "@/lib/i18n-server";
import { photo } from "@/lib/shop";
import { storefrontPath } from "@/lib/tenant-shared";
import { reviewFilters, reviewHref, reviewsPageSize, type ReviewDirectory, type ReviewTab } from "@/lib/review-directory";
import { WorkspaceHeading } from "@/components/workspace-data";
import { AdminReviewsClient } from "./reviews-client";

export default async function AdminReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  const [{ db, storeId, activeStore }, lang, params] = await Promise.all([
    requireAdmin("manage_products"), getServerLang(), searchParams,
  ]);
  const filters = reviewFilters(params);
  const data: ReviewDirectory = checked(await db.rpc("merchant_review_directory", {
    p_store_id: storeId, p_filter: filters.filter, p_q: filters.q, p_rating: filters.rating,
    p_page: filters.page, p_page_size: reviewsPageSize,
  }));
  const reviews = data.rows.map(({ image_path, ...row }) => ({ ...row, product_image_url: photo(image_path) }));
  const en = lang === "en";
  const number = new Intl.NumberFormat(en ? "en" : "ar-EG");
  const kpis = [
    [en ? "Average rating" : "متوسط التقييم", data.published_count ? data.avg_rating.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—"],
    [en ? "Total reviews" : "إجمالي التقييمات", number.format(data.total)],
    [en ? "Needs reply" : "بانتظار الرد", number.format(data.needs_reply_count)],
    [en ? "Hidden reviews" : "تقييمات مخفية", number.format(data.hidden_count)],
  ];
  const tabs: [ReviewTab, string, number][] = [
    ["all", en ? "All" : "الكل", data.total],
    ["needs_reply", en ? "Needs reply" : "بانتظار الرد", data.needs_reply_count],
    ["hidden", en ? "Hidden" : "مخفي", data.hidden_count],
  ];
  const pages = Math.max(1, Math.ceil(data.total_count / data.page_size));
  const searchLabel = en ? "Search by reviewer or comment" : "ابحث باسم المراجع أو التعليق";
  return <div className="ws-page">
    <WorkspaceHeading title={en ? "Product reviews" : "تقييمات المنتجات"} />
    <dl className="ws-kpis">{kpis.map(([label, value], index) =>
      <div key={label}><dt>{label}</dt><dd><bdi dir="ltr">{value}</bdi></dd>
        {index === 0 && <dd className="ws-kpi-note"><bdi dir="ltr">{number.format(data.published_count)}</bdi>{" "}
          {en ? "published" : "منشور"}</dd>}</div>)}</dl>
    <nav className="ws-range" aria-label={en ? "Filter reviews" : "تصفية التقييمات"}>
      {tabs.map(([filter, label, count]) => <Link key={filter} aria-current={filters.filter === filter ? "page" : undefined}
        href={reviewHref({ ...filters, filter, page: 1 })}>{label} (<bdi dir="ltr">{number.format(count)}</bdi>)</Link>)}
    </nav>
    <form action="/admin/reviews" method="get" role="search" className="ws-filters ws-sheet" key={reviewHref(filters)}>
      {filters.filter !== "all" && <input type="hidden" name="filter" value={filters.filter} />}
      <label className="ws-search"><Search size={16} strokeWidth={1.5} aria-hidden="true" /><span className="ws-sr">{searchLabel}</span>
        <input type="search" name="q" dir="auto" maxLength={100} defaultValue={filters.q} placeholder={searchLabel} /></label>
      <label><span className="ws-sr">{en ? "Rating" : "التقييم"}</span>
        <select name="rating" defaultValue={filters.rating ?? ""}><option value="">{en ? "All ratings" : "كل التقييمات"}</option>
          {[5, 4, 3, 2, 1].map(rating => <option key={rating} value={rating}>{number.format(rating)} ★</option>)}</select>
      </label><button className="ws-button" type="submit">{en ? "Apply" : "تطبيق"}</button>
      {(filters.q || filters.rating) && <Link className="ws-text-link" href={reviewHref({ ...filters, q: "", rating: null, page: 1 })}>{en ? "Clear" : "مسح"}</Link>}
    </form>
    <AdminReviewsClient key={storeId + reviewHref(filters)} reviews={reviews} storeId={storeId} lang={lang} basePath={storefrontPath(activeStore.slug)} />
    <nav className="ws-pager" aria-label={en ? "Review pages" : "صفحات التقييمات"}>
      <span>{en ? "Page " : "صفحة "}<bdi dir="ltr">{number.format(data.page)}</bdi>{en ? " of " : " من "}<bdi dir="ltr">{number.format(pages)}</bdi></span>
      <div>{data.page > 1 && <Link className="ws-button" href={reviewHref({ ...filters, page: data.page - 1 })}>{en ? "Previous" : "السابقة"}</Link>}
        {data.page < pages && <Link className="ws-button" href={reviewHref({ ...filters, page: data.page + 1 })}>{en ? "Next" : "التالية"}</Link>}</div>
    </nav>
  </div>;
}
