package com.whitelabel.commerce.core.domain.model

import com.whitelabel.commerce.core.data.remote.dto.ProductDto
import com.whitelabel.commerce.core.data.remote.dto.StoreSettingsDto
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PublishedSettingsTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun publishedHomeAndPaymentFlagsUseTheWebContract() {
        val dto = json.decodeFromString<StoreSettingsDto>(
            """{"store_name":"Shop","currency":"EGP","locale":"ar-EG","primary_color":"#123456","secondary_color":"#654321",
                "surface_color":"#FFFFFF","border_radius":8,"cod_enabled":false,"paymob_enabled":true,"paymob_wallet_enabled":true,
                "ui_config":{"defaultLanguage":"en","global":{"borderRadius":18},"pages":{"home":{
                "hero_visible":false,"hero_title_en":"Summer","hero_badge_visible":false,"hero_cta_visible":false,
                "hero_overlay_opacity":78}}}}""",
        )
        val settings = dto.toDomain(BrandPresets())
        assertFalse(settings.isRtl)
        assertFalse(settings.hero.visible)
        assertFalse(settings.isHeroVisible)
        assertFalse(settings.hero.badgeVisible)
        assertFalse(settings.hero.ctaVisible)
        assertEquals("Summer", settings.hero.titleEn)
        assertEquals(78, settings.hero.overlayOpacity)
        assertEquals(18, settings.borderRadius)
        assertEquals(listOf(PaymentMethod.WALLET), settings.paymentMethods)
        assertTrue(settings.copy(paymobEnabled = false).paymentMethods.isEmpty())
    }

    @Test
    fun homeSectionsHeroHiddenDisablesHeroBanner() {
        val dto = json.decodeFromString<StoreSettingsDto>(
            """{"store_name":"Shop","currency":"EGP","locale":"ar-EG","primary_color":"#123456","secondary_color":"#654321",
                "surface_color":"#FFFFFF","border_radius":12,
                "ui_config":{"homeSections":[{"type":"hero_banner","visible":false}],"pages":{"home":{"hero_visible":true}}}}""",
        )
        val settings = dto.toDomain(BrandPresets())
        assertTrue(settings.hero.visible)
        assertFalse(settings.heroSectionVisible)
        assertFalse(settings.isHeroVisible)
    }

    @Test
    fun productDtoDecodesSearchRpcRowsWithSpecifications() {
        val dto = json.decodeFromString<ProductDto>(
            """{"id":"11111111-1111-1111-1111-111111111111","category_id":"22222222-2222-2222-2222-222222222222",
                "name":"ساعة كرونوغراف","name_en":"Chronograph Watch","description":"وصف","description_en":"Desc",
                "price":1250,"old_price":1500,"stock":4,"sizes":["42mm"],"colors":["أسود"],
                "specifications":[{"key_ar":"مقاومة الماء","key_en":"Water Resistance","value_ar":"50 متر","value_en":"50m"}],
                "match_type":"exact"}""",
        )
        val product = dto.toDomain()
        assertEquals("Chronograph Watch", product.nameEn)
        assertEquals("exact", product.matchType)
        assertTrue(product.isLowStock)
        assertEquals(1, product.specifications.size)
        assertEquals("Water Resistance", product.specifications.first().keyEn)
    }
}
