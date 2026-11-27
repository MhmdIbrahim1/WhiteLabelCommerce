"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Package, Search, Sparkles, Tag, Zap } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { money } from "@/lib/brand";
import { storefrontImageSrc } from "@/lib/storefront-media";
import { productPricePresentation } from "@/lib/flash-sale";
import { useSaleClock } from "./use-sale-clock";
import { localizedText } from "@/lib/i18n";
import { getInstantSearchHints } from "@/lib/searchSynonyms";
import { getCachedSearchHits, searchCatalogCached, type SmartSearchHit } from "@/lib/smart-search";
import { storeHref } from "@/lib/tenant-shared";
import { SearchCorrection } from "./search-correction";

export function StoreSearch({ storeId, storeSlug, basePath, close }: {
  storeId: string; storeSlug: string; basePath: string; close: () => void;
}) {
  const { lang, t } = useLanguage();
  const isEn = lang === "en";
  const ArrowIcon = isEn ? ArrowRight : ArrowLeft;
  const pathname = usePathname();
  const href = (path: string) => storeHref(basePath, path);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SmartSearchHit[]>([]);
  const now = useSaleClock(hits);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2 || getCachedSearchHits(storeId, trimmed) !== null) return;

    const ac = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const nextHits = await searchCatalogCached(
          storeId, storeSlug, trimmed,
          ac.signal,
        );
        if (!ac.signal.aborted) {
          setHits(nextHits);
          setHasSearched(true);
        }
      } catch {
        // Ignore aborted or transient errors cleanly
      } finally {
        if (!ac.signal.aborted) setSearching(false);
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [q, storeId, storeSlug]);

  const trimmedQuery = q.trim();
  const instantHints = useMemo(
    () =>
      trimmedQuery.length >= 2
        ? getInstantSearchHints(trimmedQuery, lang, 3)
        : [],
    [trimmedQuery, lang],
  );

  const showDropdown =
    trimmedQuery.length >= 2 &&
    (searching || hasSearched || instantHints.length > 0);
  const hasDirectHit = hits.some(
    (h) => h.match_type === "exact" || h.match_type === "synonym",
  );
  const hasSpecHit = hits.some((h) => h.match_type === "spec");
  const correction = hits[0]?.was_auto_corrected ? hits[0] : null;
  const showSmartBanner = hits.length > 0 && !correction && !hasDirectHit;
  function exactHref(original: string) {
    const params = new URLSearchParams(pathname.endsWith("/products") ? window.location.search : "");
    params.set("q", original);
    params.set("exact", "1");
    params.delete("page");
    return href(`/products?${params}`);
  }

  return <div className="sf-drawer-scroll sf-search">
    <form action={href("/products")} className="sf-search-form" role="search">
      <Search size={16} aria-hidden="true" />
      <input
        data-drawer-focus=""
        name="q"
        type="search"
        aria-label={t("navSearchAria")}
        placeholder={t("navSearchPlaceholder")}
        value={q}
        onChange={(e) => {
          const next = e.target.value;
          setQ(next);
          const trimmed = next.trim();
          if (trimmed.length < 2) {
            setHits([]);
            setHasSearched(false);
            setSearching(false);
            return;
          }
          const cached = getCachedSearchHits(storeId, trimmed);
          if (cached !== null) {
            setHits(cached);
            setHasSearched(true);
            setSearching(false);
          } else {
            setHits([]);
            setHasSearched(false);
            setSearching(true);
          }
        }}
      />
      <button type="submit" aria-label={t("navSearch")}><ArrowIcon size={18}/></button>
    </form>
    {showDropdown && (
      <div
        className="suggest"
        role="region"
        aria-label={t("navSearch")}
      >
        <div className="suggest-quick-filters">
          <Link
            href={href(
              `/products?q=${encodeURIComponent(trimmedQuery)}&flash=1`,
            )}
            className="suggest-hint-chip is-flash"
            onClick={() => {
              close();
              setHasSearched(false);
            }}
          >
            <Zap size={11} aria-hidden="true" />
            <span>{isEn ? "Flash Deals" : "عروض مؤقتة"}</span>
          </Link>
          <Link
            href={href(
              `/products?q=${encodeURIComponent(trimmedQuery)}&in_stock=1`,
            )}
            className="suggest-hint-chip"
            onClick={() => {
              close();
              setHasSearched(false);
            }}
          >
            <Check size={11} aria-hidden="true" />
            <span>{isEn ? "In Stock" : "متوفر فقط"}</span>
          </Link>
        </div>
        {instantHints.length > 0 && (
          <div
            className="suggest-hints"
            aria-label={t("searchInstantHints")}
          >
            <span className="suggest-hints-label">
              <Tag size={12} aria-hidden="true" />
              {t("searchInstantHints")}
            </span>
            <div className="suggest-hints-list">
              {instantHints.map((hint) => (
                <Link
                  key={hint.tag}
                  href={href(
                    "/products?q=" + encodeURIComponent(hint.query),
                  )}
                  className="suggest-hint-chip"
                  onClick={() => {
                    close();
                    setHasSearched(false);
                  }}
                >
                  {hint.label}
                </Link>
              ))}
            </div>
          </div>
        )}

        {searching && hits.length === 0 ? (
          <p className="suggest-state">{t("navSearching")}</p>
        ) : hits.length > 0 ? (
          <>
            {correction?.corrected_from && (
              <SearchCorrection compact effective={correction.effective_query} original={correction.corrected_from}
                isEn={isEn} exactHref={exactHref(correction.corrected_from)} onNavigate={close} />
            )}
            {showSmartBanner && (
              <div className="suggest-banner">
                <Sparkles size={13} aria-hidden="true" />
                <span>
                  {hasSpecHit
                    ? t("searchSpecMatches")
                    : t("searchClosestMatches")}{" "}
                  &quot;{trimmedQuery}&quot;
                </span>
              </div>
            )}
            {hits.map((h) => {
              const hitName = localizedText(lang, h.name, h.name_en);
              const image = storefrontImageSrc(h.image_url, 128);
              const price = productPricePresentation(h, now);
              return (
                <Link
                  key={h.id}
                  href={href("/products/" + h.id)}
                  className="suggest-item"
                  onClick={() => {
                    setQ("");
                    setHits([]);
                    setHasSearched(false);
                    close();
                  }}
                >
                  <span className="suggest-thumb">
                    {image ? (
                      <Image
                        src={image}
                        alt={hitName}
                        width={42}
                        height={42}
                        unoptimized
                      />
                    ) : (
                      <Package size={18} strokeWidth={1.3} />
                    )}
                  </span>
                  <span className="suggest-meta">
                    <span className="suggest-title-row">
                      <strong>{hitName}</strong>
                      {h.match_type === "spec" && (
                        <span className="suggest-match-pill">
                          {t("searchMatchSpec")}
                        </span>
                      )}
                      {h.match_type === "fuzzy" && (
                        <span className="suggest-match-pill is-smart">
                          {t("searchMatchSmart")}
                        </span>
                      )}
                    </span>
                    <span className="suggest-price">
                      <b><bdi dir="ltr">{money(price.current, h.currency, lang)}</bdi></b>
                      {price.compareAt !== null && (
                          <del>
                            <bdi dir="ltr">{money(price.compareAt, h.currency, lang)}</bdi>
                          </del>
                        )}
                    </span>
                  </span>
                </Link>
              );
            })}
            <Link
              href={href("/products?q=" + encodeURIComponent(trimmedQuery))}
              className="suggest-all-link"
              onClick={() => {
                close();
                setHasSearched(false);
              }}
            >
              <span>
                {t("navSearchAll")} &quot;{trimmedQuery}&quot;
              </span>
              <ArrowIcon size={14} />
            </Link>
          </>
        ) : hasSearched ? (
          <p className="suggest-state">
            {t("navSearchEmpty")} &quot;{trimmedQuery}&quot;.
          </p>
        ) : null}
      </div>
    )}
  </div>;
}
