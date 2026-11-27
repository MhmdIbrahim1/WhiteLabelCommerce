import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/db";
import { getServerLang } from "@/lib/i18n-server";
import { localizedText, t } from "@/lib/i18n";
import { pagination } from "@/lib/workflow";
import { directoryHref, isRecordId, searchText } from "@/lib/workspace-directory";
import { WorkspaceEmpty, WorkspaceHeading } from "@/components/workspace-data";
import { SubmitButton } from "@/components/submit-button";
import { QuotaPrompt } from "@/components/quota-prompt";
import { getResourceAllowance } from "@/lib/billing-data";
import { isAiStudioEnabled } from "@/lib/openai-studio";
import { limitReached } from "@/lib/billing";
import { deleteProduct } from "../../mutations";
import { catalogCategories, editorProduct } from "../catalog-data";
import { AdminProductForm } from "../product-form";

export default async function ProductEditor({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query, lang, { storeId, permissions }] = await Promise.all([
    params, searchParams, getServerLang(), requireAdmin("manage_products"),
  ]);
  if (id !== "new" && !isRecordId(id)) notFound();
  const [product, categories, allowance, autofill, studio] = await Promise.all([
    id === "new" ? null : editorProduct(id), catalogCategories(), getResourceAllowance(storeId, "products"),
    getResourceAllowance(storeId, "ai_autofills"), getResourceAllowance(storeId, "ai_studio_images"),
  ]);
  if (id !== "new" && !product) notFound();
  const en = lang === "en";
  const q = searchText(query.q);
  const status = query.status === "active" || query.status === "draft" ? query.status : "";
  const { page } = pagination(query.page);
  const back = directoryHref("/admin/products", { q, status, page });
  return <div className="ws-page ws-settings-page">
    <Link className="ws-text-link" href={back}><ArrowLeft className="pt-directional" size={16} />{en ? "Products" : "المنتجات"}</Link>
    <WorkspaceHeading title={product ? localizedText(lang, product.name, product.name_en) : en ? "Add a product" : "إضافة منتج"}
      description={en ? "Manage pricing, photos and inventory for each option." : "حدّد السعر وأضف الصور واضبط مخزون كل خيار."} />
    {limitReached(allowance.used, allowance.cap) && <QuotaPrompt lang={lang} resource="products" canViewBilling={Boolean(permissions.manage_billing)} />}
    <section className="ws-box">{categories.length ? <AdminProductForm key={storeId + id} p={product ?? undefined} categories={categories}
      query={q} page={page} status={status} storeId={storeId} aiEnabled={isAiStudioEnabled()}
      allowances={{ autofillUsed: autofill.used, autofillCap: autofill.cap, studioUsed: studio.used, studioCap: studio.cap }} /> :
      <WorkspaceEmpty title={en ? "Give your first product a category" : "أضف فئة لمنتجك الأول"}
        action={<Link className="ws-button" href="/admin/products?categories=1#categories">{en ? "Add a category" : "إضافة فئة"}</Link>} />}</section>
    {product && <details className="ws-box"><summary>{t(lang, "adminDeleteProduct")}</summary>
      <form action={deleteProduct}><input type="hidden" name="id" value={id} /><input type="hidden" name="q" value={q} />
        <input type="hidden" name="status" value={status} /><input type="hidden" name="page" value={page} />
        <SubmitButton className="ws-button ws-destructive">{t(lang, "adminConfirmDelete")}</SubmitButton></form></details>}
  </div>;
}
