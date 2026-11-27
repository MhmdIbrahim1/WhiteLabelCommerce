import { SubmitButton } from "@/components/submit-button";
import { localizedText, t, type Lang } from "@/lib/i18n";
import { saveCategory, deleteCategory } from "../mutations";
import type { AdminCategoryItem } from "./product-form";

export function CategoryPanel({ categories, lang, expanded }: { categories: AdminCategoryItem[]; lang: Lang; expanded: boolean }) {
  return (
    <details className="ws-box" id="categories" open={expanded}>
        <summary>
          {t(lang, "adminManageCategories")} <bdi dir="ltr">{categories.length}</bdi>
        </summary>
        <form action={saveCategory} className="inline">
          <label>
            {t(lang, "adminCategoryNameAr")}
            <input lang="ar" dir="rtl" name="name" required />
          </label>
          <label>
            {t(lang, "adminCategoryNameEn")}
            <input
              lang="en" name="name_en"
              dir="ltr"
              placeholder={
                lang === "en" ? "e.g. Men's Fashion" : "مثال: أزياء رجالي"
              }
            />
          </label>
          <label>
            {t(lang, "adminSlug")}
            <input name="slug" dir="ltr" required />
          </label>
          <SubmitButton>{t(lang, "adminAddBtn")}</SubmitButton>
        </form>
        {categories.map((c) => (
          <details key={c.id}>
            <summary>{localizedText(lang, c.name, c.name_en)}</summary>
            <form className="inline" action={saveCategory}>
              <input type="hidden" name="id" value={c.id} />
              <label>
                {t(lang, "adminCategoryNameAr")}
                <input lang="ar" dir="rtl" name="name" defaultValue={c.name} required />
              </label>
              <label>
                {t(lang, "adminCategoryNameEn")}
                <input
                  lang="en" name="name_en"
                  dir="ltr"
                  defaultValue={c.name_en ?? ""}
                />
              </label>
              <label>
                {t(lang, "adminSlug")}
                <input name="slug" dir="ltr" defaultValue={c.slug} required />
              </label>
              <SubmitButton>{t(lang, "adminSaveBtn")}</SubmitButton>
              <SubmitButton className="danger" formAction={deleteCategory}>
                {t(lang, "adminDeleteCategory")}
              </SubmitButton>
            </form>
          </details>
        ))}
      </details>
  );
}
