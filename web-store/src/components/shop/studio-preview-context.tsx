"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { resolveStorefrontTheme } from "@/lib/storefront-theme";
import type { HomePageUiConfig } from "@/lib/ui-config";

export const StudioPreviewContext = createContext<{
  home: HomePageUiConfig; theme: ReturnType<typeof resolveStorefrontTheme>;
} | null>(null);

export const useStudioPreview = () => useContext(StudioPreviewContext);

export function PreviewHeroVisibility({ visible, children }: { visible: boolean; children: ReactNode }) {
  const preview = useStudioPreview();
  return preview?.home.hero_visible === visible ? children : null;
}
