import Link from "next/link";
import Image from "next/image";
import { Package } from "lucide-react";
import { photo, type Product } from "@/lib/shop";
import { money } from "@/lib/brand";
import { localizedText, t, type Lang } from "@/lib/i18n";
import { Buy } from "./buy";

export function Picture({ p, lang = "ar" }: { p: Product; lang?: Lang }) {
  const src = photo(p.image_path);
  const alt = localizedText(lang, p.name, p.name_en);
  return (
    <div className="product-photo">
      {src ? (
        <Image fill unoptimized src={src} alt={alt} />
      ) : (
        <Package size={44} strokeWidth={1.1} />
      )}
    </div>
  );
}

export function Price({
  p,
  currency,
  lang = "ar",
}: {
  p: Product;
  currency: string;
  lang?: Lang;
}) {
  return (
    <div className="price">
      <strong className="price-badge">{money(p.price, currency, lang)}</strong>
      {p.old_price !== null && p.old_price > p.price && (
        <del>{money(p.old_price, currency, lang)}</del>
      )}
    </div>
  );
}

export function Grid({
  rows,
  currency,
  lang = "ar",
}: {
  rows: Product[];
  currency: string;
  lang?: Lang;
}) {
  if (!rows.length) return <p className="panel">{t(lang, "noMatchingProducts")}</p>;
  return (
    <div className="product-grid">
      {rows.map((p, idx) => {
        const title = localizedText(lang, p.name, p.name_en);
        return (
          <article
            className="tile shop-animate"
            style={{ animationDelay: `${Math.min(idx, 7) * 40}ms` }}
            key={p.id}
          >
            <div className="tile-media">
              <Link
                href={"/products/" + p.id}
                className="tile-photo-link"
                aria-label={title}
              >
                <Picture p={p} lang={lang} />
              </Link>
              {p.old_price && p.old_price > p.price ? (
                <span className="discount">
                  -{Math.round(100 * (1 - p.price / p.old_price))}
                  {lang === "en" ? "%" : "٪"}
                </span>
              ) : null}
              <div className="tile-quick-add">
                <Buy p={p} />
              </div>
            </div>
            <div className="tile-body">
              <Link href={"/products/" + p.id} className="tile-title-link">
                <h3>{title}</h3>
              </Link>
              <Price p={p} currency={currency} lang={lang} />
            </div>
          </article>
        );
      })}
    </div>
  );
}
