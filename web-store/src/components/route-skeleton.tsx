import { getServerLang } from "@/lib/i18n-server";

type Layout = "catalog" | "product" | "list" | "dashboard";

export async function RouteSkeleton({ layout }: { layout: Layout }) {
  const lang = await getServerLang();
  return (
    <section className={"route-skeleton skeleton-" + layout} role="status" aria-busy="true"
      aria-label={lang === "en" ? "Loading" : "جارٍ التحميل"}>
      <div className="skeleton-title" />
      {layout === "product" ? (
        <div className="details-grid"><div className="skeleton-photo" /><div className="skeleton-copy"><i /><i /><i /></div></div>
      ) : (
        <>
          {layout === "catalog" && <div className="skeleton-filters" />}
          <div className={layout === "catalog" ? "product-grid" : layout === "dashboard" ? "exec-kpi-grid" : "skeleton-rows"}>
            {Array.from({ length: layout === "catalog" ? 8 : 4 }, (_, i) => (
              <div key={i} className="skeleton-card">
                {layout === "catalog" && <div className="skeleton-photo" />}
                <div className="skeleton-copy"><i /><i /></div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
