import Link from "next/link";

export function SearchCorrection({
  effective, original, exactHref, isEn, compact = false, onNavigate,
}: {
  effective: string;
  original: string;
  exactHref: string;
  isEn: boolean;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className={compact ? "suggest-banner" : "search-closest-banner"} role="status" dir={isEn ? "ltr" : "rtl"}>
      <span>
        {isEn ? 'Showing results for "' : "عرض نتائج لـ «"}<strong><bdi>{effective}</bdi></strong>
        {isEn ? '" — ' : "» — "}
        <Link className="search-correction-link" href={exactHref} onClick={onNavigate}>
          {isEn ? "Search instead for: " : "ابحث بدلاً من ذلك عن: "}<bdi>{original}</bdi>
        </Link>
      </span>
    </div>
  );
}
