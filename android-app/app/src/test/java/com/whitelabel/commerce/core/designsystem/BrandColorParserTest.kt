package com.whitelabel.commerce.core.designsystem

import androidx.compose.ui.graphics.Color
import com.whitelabel.commerce.core.domain.model.BrandColors
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class BrandColorParserTest {

    @Test
    fun `parses 6-digit and 3-digit hex strings accurately`() {
        assertEquals(Color(0xFF164E63), parseHexColorOrDefault("#164E63", Color.Black))
        assertEquals(Color(0xFFFFFFFF), parseHexColorOrDefault("#FFF", Color.Black))
        assertEquals(Color(0xFFC2410C), parseHexColorOrDefault("C2410C", Color.Black))
    }

    @Test
    fun `falls back gracefully on malformed color strings`() {
        assertEquals(DefaultPrimaryHex, parseHexColorOrDefault("not-a-color", DefaultPrimaryHex))
        assertEquals(DefaultSecondaryHex, parseHexColorOrDefault("", DefaultSecondaryHex))
    }

    @Test
    fun `builds distinct light and dark 60-30-10 color schemes`() {
        val brand = BrandColors(primary = "#164E63", secondary = "#C2410C", surface = "#FFFFFF")
        val light = buildLightBrandColorScheme(brand)
        val dark = buildDarkBrandColorScheme(brand)

        assertEquals(Color(0xFF164E63), light.primary)
        assertEquals(Color(0xFFC2410C), light.secondary)
        assertNotEquals(light.background, dark.background)
        assertNotEquals(light.surface, dark.surface)
    }
}
