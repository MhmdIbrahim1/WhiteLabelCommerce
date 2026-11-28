import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Package, Plus } from "lucide-react";
import { checked, requireAdmin } from "@/lib/db";
import { getResourceAllowance } from "@/lib/billing-data";
import { limitLabel, limitReached } from "@/lib/billing";
import { QuotaPrompt } from "@/components/quota-prompt";
import brand, { money } from "@/lib/brand";
import { photo, searchPattern } from "@/lib/shop";
import { productPricePresentation, resolveEffectivePrice, serverNowMs } from "@/lib/flash-sale";
import { localizedText } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { pagination } from "@/lib/workflow";
import { directoryHref, isRecordId, searchText } from "@/lib/workspace-directory";
import { DataCell, DirectoryFilters, DirectoryPager, StatusDot, WorkspaceEmpty, WorkspaceHeading, WorkspaceTable } from "@/components/workspace-data";
import { DirectoryDrawer, InspectRow } from "@/components/workspace-drawer";
import { Notice } from "../ui";
import { catalogCategories, productColumns } from "./catalog-data";
import { CategoryPanel } from "./category-panel";
import { QuickEditor } from "./quick-editor";

const path = "/admin/products";

function Thumbnail({ image }: { image: string | null }) {
  const src = photo(image);
  return <span className="ws-thumb">{src ? <Image src={src} unoptimized width={64} height={72} alt="" /> : <Package size={19} />}</span>;
}

export default async function Products({ searchParams }: PageProps<"/admin/products">) {
  const [params, lang, { db, storeId, permissions }] = await Promise.all([searchParams, getServerLang(), requireAdmin("manage_products")]);
  const en = lang === "en";
  const q = searchText(params.q);
  const status = params.status === "active" || params.status === "draft" ? params.status : "";
  const { from, to, page } = pagination(params.page);
  const listHref = directoryHref(path, { q, status, page });
  const editorHref = (id: string) => path + "/" + id + listHref.slice(path.length);
  const inspect = isRecordId(params.inspect) ? params.inspect : null;
  let query = db.from("products").select(productColumns, { count: "exact" }).eq("store_id", storeId);
  if (status) query = query.eq("is_active", status === "active");
  if (q) {
    const pattern = JSON.stringify(searchPattern(q));
    query = query.or(["name", "name_en", "slug"].map(field => field + ".ilike." + pattern).join(","));
  }
  const [result, billing, categories, selectedResult, settings] = await Promise.all([
    query.order("name").order("id").range(from, to), getResourceAllowance(storeId, "products"), catalogCategories(),
    inspect ? db.from("products").select(`${productColumns},product_variants(color)`).eq("store_id", storeId)
      .eq("product_variants.listed", true).eq("id", inspect).maybeSingle() : null,
    db.from("store_settings").select("currency").eq("store_id", storeId).maybeSingle(),
  ]);
  const products = checked(result);
  const now = serverNowMs();
  const selected = selectedResult?.error ? checked(selectedResult) : selectedResult?.data;
  const category = categories.find(c => c.id === selected?.category_id);
  const currency = settings.data?.currency || brand.currency;
  const denied = params.result === "plan_limit_reached" || params.result === "limit_reached";
  const canViewBilling = Boolean(permissions.manage_billing);
  const active = en ? "Active" : "منشور";
  const draft = en ? "Draft" : "مسودة";
  const add = en ? "Add product" : "إضافة منتج";
  const columns = en ? ["Product", "Price", "Stock", "Status", "Inspect"] : ["المنتج", "السعر", "المخزون", "الحالة", "معاينة"];
  return <div className="ws-page">
    <WorkspaceHeading title={en ? "Products" : "المنتجات"} description={<>{en ? "Published products" : "المنتجات المنشورة"} · <bdi dir="ltr">{limitLabel(billing.used, lang)} / {limitLabel(billing.cap, lang)}</bdi></>}>
      <Link className="ws-button" href={directoryHref(path, { q, status, page, categories: true }) + "#categories"}>{en ? "Categories" : "الفئات"}</Link>
      <Link className="ws-primary" href={editorHref("new")}><Plus size={16} />{add}</Link>
    </WorkspaceHeading>
    {(denied || limitReached(billing.used, billing.cap)) && <QuotaPrompt canViewBilling={canViewBilling} resource="products" lang={lang} />}
    {!denied && <Notice result={params.result} />}
    <section className="ws-sheet ws-product-sheet">
      <DirectoryFilters path={path} query={q} status={status} lang={lang} choices={[["active", active], ["draft", draft]]}
        placeholder={en ? "Search by name or product slug" : "ابحث باسم المنتج أو رابطه المختصر"} />
      {products.length ? <WorkspaceTable columns={columns} caption={en ? "Product catalog" : "دليل المنتجات"}>
        {products.map(p => {
          const title = localizedText(lang, p.name, p.name_en);
          const pricing = productPricePresentation(p, now);
          const href = directoryHref(path, { q, status, page, inspect: p.id });
          return <InspectRow key={p.id} href={href}>
            <DataCell><Link className="ws-record" href={href} replace scroll={false} prefetch={false} id={"inspect-" + p.id} aria-haspopup="dialog">
              <Thumbnail image={p.image_path} /><span className="ws-cell-stack"><strong dir="auto">{title}</strong><small><bdi dir="ltr">{p.slug}</bdi></small></span></Link></DataCell>
            <DataCell label={columns[1]}><div className="ws-cell-stack"><strong><bdi dir="ltr">{money(pricing.current, currency, lang)}</bdi></strong>
              {pricing.compareAt !== null && <small><del><bdi dir="ltr">{money(pricing.compareAt, currency, lang)}</bdi></del> · {pricing.flash
                ? (en ? "Flash Sale" : "عرض فلاش") : (en ? "Sale" : "خصم عادي")} <bdi dir="ltr">−{pricing.savings}%</bdi></small>}</div></DataCell>
            <DataCell label={columns[2]}><bdi dir="ltr">{p.stock}</bdi></DataCell>
            <DataCell label={columns[3]}><StatusDot status={p.is_active ? "active" : "draft"}>{p.is_active ? active : draft}</StatusDot></DataCell>
            <DataCell><Link className="ws-icon-button" href={href} replace scroll={false} prefetch={false} aria-haspopup="dialog" aria-label={columns[4] + " · " + title}>
              <ArrowRight className="pt-directional" size={16} /></Link></DataCell>
          </InspectRow>;
        })}</WorkspaceTable> : <WorkspaceEmpty title={q || status || page > 1 ? (en ? "No products in this view" : "لا توجد منتجات في هذه القائمة") : en ? "Your catalog starts here" : "ابدأ بإضافة أول منتج"}
          action={q || status || page > 1 ? <Link className="ws-button" href={path}>{en ? "View all products" : "عرض كل المنتجات"}</Link> :
            <Link className="ws-primary" href={editorHref("new")}>{add}</Link>}>
          {q || status || page > 1 ? (en ? "Try another name or clear the filters." : "جرّب اسماً آخر أو امسح عوامل التصفية.") :
            en ? "Add a product with a photo, price and opening stock." : "أضف صورة المنتج وسعره والكمية المتاحة للبيع."}</WorkspaceEmpty>}
      <DirectoryPager path={path} count={result.count ?? 0} page={page} q={q} status={status} lang={lang} />
    </section>
    <CategoryPanel categories={categories} lang={lang} expanded={params.categories === "1"} />
    {inspect && <DirectoryDrawer key={storeId + inspect} listHref={listHref} recordId={inspect} title={en ? "Product details" : "تفاصيل المنتج"}
      subtitle={selected && <bdi dir="ltr">{selected.slug}</bdi>}>
      {selected ? <><section className="ws-stack"><div className="ws-record"><Thumbnail image={selected.image_path} />
        <div className="ws-cell-stack"><h3 dir="auto">{localizedText(lang, selected.name, selected.name_en)}</h3>
          <StatusDot status={selected.is_active ? "active" : "draft"}>{selected.is_active ? active : draft}</StatusDot></div></div>
        <dl className="ws-facts"><div><dt>{en ? "Category" : "الفئة"}</dt><dd>{category ? localizedText(lang, category.name, category.name_en) : "—"}</dd></div>
          <div><dt>{en ? "Selling price" : "سعر البيع"}</dt><dd><bdi dir="ltr">{money(resolveEffectivePrice(selected), currency, lang)}</bdi></dd></div></dl></section>
        <section><QuickEditor product={{ id: selected.id, name: selected.name, name_en: selected.name_en, price: selected.price, stock: selected.stock,
          is_active: selected.is_active, hasVariants: selected.product_variants.length > 0 }} editorHref={editorHref(selected.id)} storeId={storeId}
          lang={lang} currency={currency} canViewBilling={canViewBilling} /></section></> :
        <p role="status">{en ? "This product is no longer in this store." : "لم يعد هذا المنتج ضمن كتالوج المتجر."}</p>}
    </DirectoryDrawer>}
  </div>;
}
