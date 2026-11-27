import brand from "./brand";
import { resolveUiConfig } from "./ui-config";

export type DesignSettingsRow = {
  theme_template: string; primary_color: string; secondary_color: string;
  surface_color: string; border_radius: number; ui_config?: unknown;
};

export const designFields = "theme_template,primary_color,secondary_color,surface_color,border_radius,ui_config";

export function readStoreDesign(row: DesignSettingsRow) {
  return resolveUiConfig(row.ui_config, {
    template: row.theme_template,
    primary: row.primary_color || brand.colors.primary,
    accent: row.secondary_color || brand.colors.secondary,
    surface: row.surface_color || brand.colors.surface,
    radius: row.border_radius ?? brand.borderRadius,
  });
}
