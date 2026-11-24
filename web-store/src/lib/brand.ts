import brand from "../../../shared/brand-config.json";
import { formatDate, formatMoney, type Lang } from "./i18n";
export default brand;
export const money = (
  value: number | null,
  currency = brand.currency,
  lang: Lang = "ar",
) => formatMoney(value, currency, lang);
export const date = (value: string, lang: Lang = "ar") =>
  formatDate(value, lang);
