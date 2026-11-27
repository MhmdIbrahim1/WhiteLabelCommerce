package com.whitelabel.commerce.core.designsystem

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import com.whitelabel.commerce.core.data.remote.dto.PublishedGlobal
import com.whitelabel.commerce.core.data.remote.dto.PublishedUi
import com.whitelabel.commerce.core.data.remote.dto.StoreSettingsDto
import com.whitelabel.commerce.core.domain.model.BrandColors
import com.whitelabel.commerce.core.domain.model.BrandPresets
import com.whitelabel.commerce.core.domain.model.StoreThemeTemplate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class StoreThemeTemplateTest {
    private val legacy = StoreSettingsDto(storeName = "Shop", currency = "EGP", locale = "en",
        primaryColor = "#123456", secondaryColor = "#123457", surfaceColor = "#FFFFFE", borderRadius = 9)

    private fun asColor(hex: String) = parseHexColorOrDefault(hex, Color.Transparent)

    private fun assertReadable(fg: Color, bg: Color) {
        val a = fg.luminance()
        val b = bg.luminance()
        assertTrue("Foreground $fg on $bg", (maxOf(a, b) + 0.05f) / (minOf(a, b) + 0.05f) >= 4.5f)
    }

    @Test fun changingOnlyThePublishedTemplateChangesTheWholePaletteAndShape() {
        val expected = mapOf(
            "modern-minimal" to (BrandColors("#164E63", "#C2410C", "#F6F8F9", "#FFFFFF", "#DCE5E7") to 12),
            "luxury-boutique" to (BrandColors("#242322", "#856425", "#F5F1EA", "#FFFDFA", "#C9BA9D") to 4),
            "vibrant-pop" to (BrandColors("#752AA0", "#B92D59", "#FAF2FC", "#FFFCFF", "#E5C7EB") to 20),
            "tech-grid" to (BrandColors("#303D87", "#17677A", "#EDF1F8", "#FAFCFF", "#ABB9CE") to 8),
        )
        val seededNova = legacy.copy(primaryColor = "#164E63", secondaryColor = "#C2410C", surfaceColor = "#FFFFFF", borderRadius = 12)
        for ((id, palette) in expected) {
            val settings = seededNova.copy(themeTemplate = id).toDomain(BrandPresets())
            val (colors, radius) = palette
            assertEquals(id, settings.themeTemplate)
            assertEquals(colors, settings.colors)
            assertEquals(radius, settings.borderRadius)
            val light = buildLightBrandColorScheme(colors)
            assertEquals(asColor(colors.primary), light.primary)
            assertEquals(asColor(colors.secondary), light.secondary)
            assertEquals(asColor(colors.page), light.background)
            assertEquals(asColor(colors.surface), light.surface)
            assertEquals(asColor(colors.line), light.outlineVariant)
            assertEquals(light.outlineVariant, light.surfaceContainerHighest)
            assertEquals(light.outlineVariant, buildExtendedBrandColors(colors, false).hairline)
            val dark = buildDarkBrandColorScheme(colors)
            assertEquals(Color(0xFF40505A), dark.outlineVariant)
            assertEquals(dark.outlineVariant, buildExtendedBrandColors(colors, true).hairline)
            for (scheme in listOf(light, dark)) {
                assertReadable(scheme.onPrimary, scheme.primary)
                assertReadable(scheme.onSecondary, scheme.secondary)
                assertReadable(scheme.onBackground, scheme.background)
                assertReadable(scheme.onSurface, scheme.surface)
            }
        }
    }

    @Test fun globalOverridesWinAndBlankValuesUseTheSelectedTemplate() {
        val global = PublishedGlobal(primaryButtonBg = "#747474", accentBadge = "#008844", pageBg = " ",
            cardSurface = "#F0F0F0", borderRadius = 3)
        val settings = legacy.copy(themeTemplate = "tech-grid", uiConfig = PublishedUi(global = global)).toDomain(BrandPresets())
        assertEquals(BrandColors("#747474", "#008844", "#EDF1F8", "#F0F0F0", "#ABB9CE"), settings.colors)
        assertEquals(3, settings.borderRadius)
        val light = buildLightBrandColorScheme(settings.colors)
        assertReadable(light.onPrimary, light.primary)
        val dark = buildDarkBrandColorScheme(settings.colors)
        assertReadable(dark.onPrimary, dark.primary)
        assertTrue(dark.primary != buildDarkBrandColorScheme(BrandColors()).primary)
        assertEquals(Color(0xFF40505A), dark.outlineVariant)
    }

    @Test fun preTemplateAndMigratedModernStoresKeepMerchantColorsUntilOverridden() {
        val expected = BrandColors("#123456", "#123457", "#F6F8F9", "#FFFFFE", "#DCE5E7")
        val migrated = legacy.copy(themeTemplate = "modern-minimal")
        for (dto in listOf(legacy, migrated)) {
            val settings = dto.toDomain(BrandPresets())
            assertEquals(expected, settings.colors)
            assertEquals(9, settings.borderRadius)
        }
        val global = PublishedGlobal(primaryButtonBg = " ", accentBadge = "#874420", borderRadius = 0)
        val published = migrated.copy(uiConfig = PublishedUi(global = global)).toDomain(BrandPresets())
        assertEquals(expected.copy(secondary = "#874420"), published.colors)
        assertEquals(0, published.borderRadius)
    }

    @Test fun unrecognizedTemplatesResolveToModern() {
        for (id in listOf(null, "", " ", "future")) assertEquals(StoreThemeTemplate.MODERN, StoreThemeTemplate.resolve(id))
        val settings = legacy.copy(themeTemplate = "future").toDomain(BrandPresets())
        assertEquals(BrandColors(), settings.colors)
        assertEquals(12, settings.borderRadius)
    }
}
