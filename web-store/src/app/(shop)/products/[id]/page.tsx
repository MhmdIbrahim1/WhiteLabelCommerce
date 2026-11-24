import { notFound } from "next/navigation";
import { serverDb, checked } from "@/lib/db";
import { settings, photo, productFields, type Product } from "@/lib/shop";
import { localizedText, t } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { Price, Grid } from "@/components/shop/cards";
import { ProductGallery } from "@/components/shop/gallery";
import { Buy } from "@/components/shop/buy";
import { ProductSpecsTable } from "@/components/shop/product-specs";

export default async function Details({ params }: PageProps<"/products/[id]">) {
  const { id } = await params;
  const db = await serverDb();
  const result = await db
    .from("products")
    .select(productFields)
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle<Product>();
  if (result.error?.code === "22P02" || (!result.error && !result.data))
    notFound();
  const p = checked(result);
  const [s, lang, related] = await Promise.all([
    settings(),
    getServerLang(),
    db
      .from("products")
      .select(productFields)
      .eq("category_id", p.category_id)
      .eq("is_active", true)
      .neq("id", id)
      .limit(4),
  ]);

  const title = localizedText(lang, p.name, p.name_en);
  const desc = localizedText(lang, p.description, p.description_en);

  return (
    <>
      <section className="details-grid">
        <ProductGallery src={photo(p.image_path)} alt={title} />
        <div>
          <h1>{title}</h1>
          <Price p={p} currency={s.currency} lang={lang} />
          <p>{desc}</p>
          <p className="detail-stock-line">
            {t(lang, "inStockLabel")} · <strong>{p.stock}</strong>
          </p>
          <Buy p={p} detail />
        </div>
      </section>

      <ProductSpecsTable specs={p.specifications} />

      <section className="shop-section">
        <div className="split section-head">
          <div>
            <span className="section-kicker">{t(lang, "kickerFeatured")}</span>
            <h2>{t(lang, "relatedProducts")}</h2>
          </div>
        </div>
        <Grid rows={checked(related)} currency={s.currency} lang={lang} />
      </section>
    </>
  );
}
