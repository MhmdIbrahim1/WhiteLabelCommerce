package com.whitelabel.commerce

import com.whitelabel.commerce.core.data.remote.dto.ProductDto
import com.whitelabel.commerce.core.data.repository.flashSalePage
import com.whitelabel.commerce.core.domain.model.CartItem
import com.whitelabel.commerce.core.domain.model.FlashSalePricing
import com.whitelabel.commerce.core.domain.model.Product
import com.whitelabel.commerce.core.domain.repository.FlashSaleFeed
import io.github.jan.supabase.annotations.SupabaseExperimental
import io.github.jan.supabase.postgrest.PropertyConversionMethod
import io.github.jan.supabase.postgrest.query.PostgrestRequestBuilder
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AovAndFlashSaleTest {

    private val json = Json { ignoreUnknownKeys = true }

    @OptIn(SupabaseExperimental::class)
    @Test
    fun flashPagesReadTheSelectedStoreByExpiryAcrossCatalogPages() {
        val request = PostgrestRequestBuilder(PropertyConversionMethod.NONE)
        request.flashSalePage("cat", 100, 100)
        assertEquals(listOf("eq.${BuildConfig.STORE_ID}"), request.params["store_id"])
        assertEquals(listOf("eq.cat"), request.params["category_id"])
        assertEquals(listOf("flash_sale_ends_at.asc.nullslast,id.asc.nullslast"), request.params["order"])
        assertEquals(listOf("100"), request.params["limit"])
        assertEquals(listOf("100"), request.params["offset"])
    }

    @Test
    fun existingDiscountEntersFlashOnlyWhenSelectedAndKeepsItsPrice() {
        val start = "2026-11-28T12:00:00Z"
        val end = "2026-11-28T13:00:00Z"
        val now = FlashSalePricing.parseIsoTimestampMillis(start)!!
        val expires = FlashSalePricing.parseIsoTimestampMillis(end)!!
        val regularSale = Product(id = "discount", categoryId = "c", name = "Sale", price = 30.0, oldPrice = 100.0)
        assertFalse(regularSale.isFlashSaleActive(now))
        val promoted = regularSale.copy(flashSalePrice = 30.0, flashSaleStartsAt = start, flashSaleEndsAt = end)
        assertFalse(promoted.isFlashSaleActive(now - 1))
        assertTrue(promoted.isFlashSaleActive(now))
        assertEquals(30.0, promoted.effectivePrice(now), 0.0)
        assertEquals(70, promoted.flashSavingsPercent(now))
        assertEquals(100.0, promoted.displayStrikePrice(now)!!, 0.0)
        assertFalse(promoted.copy(oldPrice = null).isFlashSaleActive(now))
        assertFalse(promoted.copy(flashSalePrice = 40.0).isFlashSaleActive(now))
        assertFalse(promoted.isFlashSaleActive(expires))
        assertEquals(100.0, promoted.displayStrikePrice(expires)!!, 0.0)
        val deeperFlash = promoted.copy(flashSalePrice = 15.0)
        assertEquals(50, deeperFlash.flashSavingsPercent(now))
        assertEquals(30.0, deeperFlash.displayStrikePrice(now)!!, 0.0)
    }

    @Test
    fun flashFeedRefreshesAtFirstOpeningOrExpiryEvenWhenCurrentlyEmpty() {
        val end = "2026-11-28T13:00:00Z"
        val expiry = FlashSalePricing.parseIsoTimestampMillis(end)!!
        val product = Product(id = "deal", categoryId = "c", name = "Deal", price = 10.0, flashSaleEndsAt = end)
        assertEquals(expiry - 10L, FlashSaleFeed(emptyList(), expiry - 10L).refreshAtMillis)
        assertEquals(expiry - 10L, FlashSaleFeed(listOf(product), expiry - 10L).refreshAtMillis)
        assertEquals(expiry, FlashSaleFeed(listOf(product), expiry + 10L).refreshAtMillis)
        assertNull(FlashSaleFeed(emptyList(), null).refreshAtMillis)
    }

    @Test
    fun activeFlashSaleWindowReturnsDiscountedEffectivePriceAndSavings() {
        val nowMs = FlashSalePricing.parseIsoTimestampMillis("2026-11-25T12:00:00Z")!!
        val product = Product(
            id = "p-flash",
            categoryId = "cat-1",
            name = "ساعة فاخرة",
            price = 1000.0,
            flashSalePrice = 750.0,
            flashSaleStartsAt = "2026-11-25T10:00:00Z",
            flashSaleEndsAt = "2026-11-28T12:00:00Z",
            stock = 10,
        )

        assertTrue(product.isFlashSaleActive(nowMs))
        assertEquals(750.0, product.effectivePrice(nowMs), 0.001)
        assertEquals(25, product.flashSavingsPercent(nowMs))
        assertEquals(1000.0, product.displayStrikePrice(nowMs)!!, 0.001)
    }

    @Test
    fun scheduledAndExpiredFlashSaleFallbackToRegularPrice() {
        val nowMs = FlashSalePricing.parseIsoTimestampMillis("2026-11-25T12:00:00Z")!!

        val scheduled = Product(
            id = "p-future",
            categoryId = "cat-1",
            name = "جاكيت جلد",
            price = 1500.0,
            oldPrice = 1800.0,
            flashSalePrice = 1100.0,
            flashSaleStartsAt = "2026-11-26T00:00:00Z",
            flashSaleEndsAt = "2026-11-28T00:00:00Z",
            stock = 5,
        )
        assertFalse(scheduled.isFlashSaleActive(nowMs))
        assertEquals(1500.0, scheduled.effectivePrice(nowMs), 0.001)
        assertNull(scheduled.flashSavingsPercent(nowMs))
        assertEquals(1800.0, scheduled.displayStrikePrice(nowMs)!!, 0.001)

        val expired = Product(
            id = "p-expired",
            categoryId = "cat-1",
            name = "سنيكرز رياضي",
            price = 900.0,
            flashSalePrice = 700.0,
            flashSaleStartsAt = "2026-11-20T00:00:00Z",
            flashSaleEndsAt = "2026-11-24T23:59:59Z",
            stock = 8,
        )
        assertFalse(expired.isFlashSaleActive(nowMs))
        assertEquals(900.0, expired.effectivePrice(nowMs), 0.001)
        assertNull(expired.flashSavingsPercent(nowMs))
        assertNull(expired.displayStrikePrice(nowMs))
    }

    @Test
    fun countdownFormattingHandlesMultiDayAndSubDayInRtlAndLtr() {
        val twoDaysPlus = ((2L * 86_400L) + (14L * 3_600L) + (35L * 60L) + 12L) * 1000L
        assertEquals("2d 14:35:12", FlashSalePricing.formatCountdown(twoDaysPlus, isRtl = false))
        assertEquals("2ي 14:35:12", FlashSalePricing.formatCountdown(twoDaysPlus, isRtl = true))

        val under24h = ((5L * 3_600L) + (7L * 60L) + 9L) * 1000L
        assertEquals("05:07:09", FlashSalePricing.formatCountdown(under24h, isRtl = false))
        assertEquals("05:07:09", FlashSalePricing.formatCountdown(under24h, isRtl = true))
    }

    @Test
    fun productDtoDeserializesFlashSaleFieldsAndCartItemRespectsExpiry() {
        val payload = """
            {
              "id": "p-dto-1",
              "category_id": "cat-1",
              "name": "حقيبة جلدية",
              "name_en": "Leather Bag",
              "price": 1200.0,
              "old_price": 1400.0,
              "flash_sale_price": 960.0,
              "flash_sale_starts_at": "2026-11-25T00:00:00+00:00",
              "flash_sale_ends_at": "2026-11-28T00:00:00+00:00",
              "stock": 7,
              "avg_rating": 4.9,
              "review_count": 3
            }
        """.trimIndent()

        val product = json.decodeFromString<ProductDto>(payload).toDomain()
        val duringMs = FlashSalePricing.parseIsoTimestampMillis("2026-11-26T10:00:00Z")!!
        val afterMs = FlashSalePricing.parseIsoTimestampMillis("2026-11-29T10:00:00Z")!!

        assertEquals(960.0, product.flashSalePrice!!, 0.001)
        assertTrue(product.isFlashSaleActive(duringMs))
        assertEquals(960.0, product.effectivePrice(duringMs), 0.001)
        assertEquals(20, product.flashSavingsPercent(duringMs))
        assertEquals(1200.0, product.effectivePrice(afterMs), 0.001)

        val cartItem = CartItem(
            productId = product.id,
            productName = product.name,
            unitPrice = product.effectivePrice(duringMs),
            regularPrice = product.price,
            flashSalePrice = product.flashSalePrice,
            flashSaleStartsAt = product.flashSaleStartsAt,
            flashSaleEndsAt = product.flashSaleEndsAt,
            quantity = 2,
            maxStock = product.stock,
        )
        assertEquals(960.0, cartItem.effectiveUnitPrice(duringMs), 0.001)
        assertEquals(1200.0, cartItem.effectiveUnitPrice(afterMs), 0.001)
    }
}
