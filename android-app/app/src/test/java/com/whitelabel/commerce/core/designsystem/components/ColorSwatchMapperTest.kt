package com.whitelabel.commerce.core.designsystem.components

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class ColorSwatchMapperTest {

    @Test
    fun `maps Arabic, English, and hex swatch colors`() {
        assertEquals(Color(0xFF18181B), ColorSwatchMapper.resolveOrNull("أسود"))
        assertEquals(Color(0xFF1E3A5F), ColorSwatchMapper.resolveOrNull("Navy"))
        assertEquals(Color(0xFF164E63), ColorSwatchMapper.resolveOrNull("#164E63"))
        assertNotNull(ColorSwatchMapper.resolveOrNull("أبيض"))
        assertNull(ColorSwatchMapper.resolveOrNull("لون غير معروف"))
    }
}
