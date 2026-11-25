package com.whitelabel.commerce

import com.whitelabel.commerce.core.data.remote.dto.StoreSettingsDto
import com.whitelabel.commerce.core.data.remote.dto.WalletSummaryDto
import com.whitelabel.commerce.core.domain.model.BrandPresets
import com.whitelabel.commerce.core.domain.model.StoreSettings
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WalletAndIncentivesTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun freeShippingThresholdUnlocksZeroFeeAtOrAboveThreshold() {
        val settings = StoreSettings(
            shippingFee = 50.0,
            cartIncentiveEnabled = true,
            freeShippingThreshold = 1000.0,
        )
        assertEquals(50.0, settings.effectiveShippingFee(890.0), 0.001)
        assertFalse(settings.isFreeShippingUnlocked(890.0))

        assertEquals(0.0, settings.effectiveShippingFee(1000.0), 0.001)
        assertTrue(settings.isFreeShippingUnlocked(1000.0))

        assertEquals(0.0, settings.effectiveShippingFee(1450.0), 0.001)
        assertTrue(settings.isFreeShippingUnlocked(1450.0))
    }

    @Test
    fun disabledCartIncentivePreservesShippingFee() {
        val settings = StoreSettings(
            shippingFee = 50.0,
            cartIncentiveEnabled = false,
            freeShippingThreshold = 1000.0,
        )
        assertEquals(50.0, settings.effectiveShippingFee(2500.0), 0.001)
        assertFalse(settings.isFreeShippingUnlocked(2500.0))
    }

    @Test
    fun storeSettingsDtoDecodesPhase10aIncentiveAndCashbackColumns() {
        val payload = """
            {
              "id": true,
              "store_name": "Nova Store",
              "currency": "EGP",
              "locale": "ar-EG",
              "primary_color": "#164E63",
              "secondary_color": "#C2410C",
              "surface_color": "#FFFFFF",
              "border_radius": 12,
              "shipping_fee": 50.0,
              "cart_incentive_enabled": true,
              "free_shipping_threshold": 1200.0,
              "cashback_enabled": true,
              "cashback_percentage": 7.5
            }
        """.trimIndent()
        val domain = json.decodeFromString<StoreSettingsDto>(payload).toDomain(BrandPresets())
        assertTrue(domain.cartIncentiveEnabled)
        assertEquals(1200.0, domain.freeShippingThreshold, 0.001)
        assertTrue(domain.cashbackEnabled)
        assertEquals(7.5, domain.cashbackPercentage, 0.001)
    }

    @Test
    fun walletSummaryDtoDecodesBalanceAndBilingualTransactions() {
        val payload = """
            {
              "balance": 145.5,
              "currency": "EGP",
              "cashback_enabled": true,
              "cashback_percentage": 5,
              "transactions": [
                {
                  "id": "tx-1",
                  "order_id": "11111111-1111-1111-1111-111111111111",
                  "type": "cashback_earned",
                  "amount": 45.5,
                  "balance_after": 145.5,
                  "note_ar": "كاش باك على الطلب #11111111",
                  "note_en": "Cashback earned on order #11111111",
                  "created_at": "2026-11-25T00:00:00Z"
                }
              ]
            }
        """.trimIndent()
        val summary = json.decodeFromString<WalletSummaryDto>(payload).toDomain()
        assertEquals(145.5, summary.balance, 0.001)
        assertEquals("EGP", summary.currency)
        assertEquals(1, summary.transactions.size)
        assertEquals("cashback_earned", summary.transactions.first().type)
        assertEquals(45.5, summary.transactions.first().amount, 0.001)
    }
}
