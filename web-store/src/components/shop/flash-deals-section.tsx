import Link from "next/link";
import { ArrowLeft, ArrowRight, Zap } from "lucide-react";
import type { Product } from "@/lib/shop";
import type { Lang } from "@/lib/i18n";
import { storeHref } from "@/lib/tenant-shared";
import { filterActiveFlashDeals } from "@/lib/flash-sale";
import { Grid } from "./cards";

export function FlashDealsSection({
  products,
  currency,
  lang = "ar",
  basePath = "",
}: {
  products: Product[];
  currency: string;
  lang?: Lang;
  basePath?: string;
}) {
  const activeDeals = filterActiveFlashDeals(products).slice(0, 8);

  if (activeDeals.length === 0) {
    return null;
  }

  const isEn = lang === "en";
  const ArrowIcon = isEn ? ArrowRight : ArrowLeft;

  return (
    <section
      data-home-section="flash_deals"
      className="shop-section flash-deals-section shop-animate"
    >
      <div className="split section-head flash-deals-head">
        <div>
          <span className="section-kicker flash-deals-kicker">
            <Zap size={13} aria-hidden="true" />
            <span>{isEn ? "Limited-Time Offers" : "عروض لفترة محدودة"}</span>
          </span>
          <h2>{isEn ? "Flash Deals" : "عروض مؤقتة"}</h2>
        </div>
        <Link
          href={storeHref(basePath, "/products?flash=1")}
          className="section-more-link"
        >
          <span>{isEn ? "View All" : "عرض الكل"}</span>
          <ArrowIcon size={15} />
        </Link>
      </div>
      <Grid
        rows={activeDeals}
        currency={currency}
        lang={lang}
        basePath={basePath}
      />
    </section>
  );
}
