package com.whitelabel.commerce

import com.whitelabel.commerce.core.data.remote.dto.AbandonedCartItemParamDto
import com.whitelabel.commerce.core.data.remote.dto.AbandonedCartSessionKeys
import com.whitelabel.commerce.core.data.remote.dto.MarkAbandonedCartRecoveredParamsDto
import com.whitelabel.commerce.core.data.remote.dto.UpsertAbandonedCartParamsDto
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AbandonedCartSyncTest {

    private val json = Json {
        encodeDefaults = true
        ignoreUnknownKeys = true
    }

    @Test
    fun androidSessionKeyUsesStablePrefix() {
        assertEquals(
            "android-user-123",
            AbandonedCartSessionKeys.forAndroidUser("  user-123 "),
        )
    }

    @Test
    fun upsertAbandonedCartSerializesExactRpcParameters() {
        val params = UpsertAbandonedCartParamsDto(
            storeId = "00000000-0000-0000-0000-000000000001",
            sessionKey = "android-u1",
            items = listOf(
                AbandonedCartItemParamDto(
                    id = "prod-1",
                    name = "حقيبة قماشية",
                    nameEn = "Canvas Tote",
                    quantity = 2,
                    price = 250.0,
                    size = "L",
                    color = "Black",
                ),
            ),
            subtotal = 500.0,
            currency = "EGP",
            source = "android",
            customerEmail = "buyer@example.com",
        )
        val encoded = json.encodeToString(params)
        assertTrue(encoded.contains("\"p_store_id\":\"00000000-0000-0000-0000-000000000001\""))
        assertTrue(encoded.contains("\"p_session_key\":\"android-u1\""))
        assertTrue(encoded.contains("\"p_source\":\"android\""))
        assertTrue(encoded.contains("\"p_subtotal\":500.0"))
        assertTrue(encoded.contains("\"p_currency\":\"EGP\""))
    }

    @Test
    fun markRecoveredSerializesExactRpcParameters() {
        val params = MarkAbandonedCartRecoveredParamsDto(
            storeId = "00000000-0000-0000-0000-000000000001",
            sessionKey = "android-u1",
            orderId = "ord-999",
        )
        val encoded = json.encodeToString(params)
        assertTrue(encoded.contains("\"p_store_id\""))
        assertTrue(encoded.contains("\"p_session_key\":\"android-u1\""))
        assertTrue(encoded.contains("\"p_order_id\":\"ord-999\""))
    }
}
