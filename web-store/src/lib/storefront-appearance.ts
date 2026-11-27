import "server-only";
import { cache } from "react";
import { settings } from "./shop";
import { getPublishedTheme } from "./platform-theme-data";
import { resolveStorefrontTheme } from "./storefront-theme";

export const storefrontAppearance = cache(async () => {
  const [store, platform] = await Promise.all([settings(), getPublishedTheme()]);
  return resolveStorefrontTheme(store.uiConfig, platform);
});
