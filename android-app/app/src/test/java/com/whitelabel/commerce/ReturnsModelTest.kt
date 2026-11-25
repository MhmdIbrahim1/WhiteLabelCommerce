package com.whitelabel.commerce

import com.whitelabel.commerce.core.data.remote.dto.ReturnRequestDto
import com.whitelabel.commerce.core.data.remote.dto.SubmitReturnItemParamDto
import com.whitelabel.commerce.core.data.remote.dto.SubmitReturnParamsDto
import com.whitelabel.commerce.core.domain.model.ReturnReasons
import com.whitelabel.commerce.core.domain.model.ReturnRefundMethod
import com.whitelabel.commerce.core.domain.model.ReturnRequestStatus
import com.whitelabel.commerce.core.domain.model.ReturnRequestType
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReturnsModelTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    @Test
    fun returnRequestDtoDecodesWalletRefundAndItems() {
        val raw = """
            {
              "id": "ret-1111",
              "store_id": "00000000-0000-0000-0000-000000000001",
              "order_id": "ord-2222",
              "user_id": "usr-3333",
              "request_type": "exchange",
              "status": "refunded",
              "refund_method": "wallet",
              "reason": "wrong_size",
              "customer_notes": "Need size L",
              "admin_notes": "Credited instantly",
              "refund_amount": 890.0,
              "items": [
                {
                  "order_item_id": "oi-1",
                  "product_id": "prod-1",
                  "product_name": "Linen Shirt",
                  "quantity": 1,
                  "unit_price": 890.0,
                  "line_total": 890.0,
                  "size": "M",
                  "color": "White"
                }
              ],
              "restocked": true,
              "wallet_credited": true,
              "created_at": "2026-11-25T10:00:00Z",
              "updated_at": "2026-11-25T11:00:00Z"
            }
        """.trimIndent()

        val domain = json.decodeFromString<ReturnRequestDto>(raw).toDomain()

        assertEquals("ret-1111", domain.id)
        assertEquals(ReturnRequestType.EXCHANGE, domain.requestType)
        assertEquals(ReturnRequestStatus.REFUNDED, domain.status)
        assertEquals(ReturnRefundMethod.WALLET, domain.refundMethod)
        assertEquals(890.0, domain.refundAmount, 0.001)
        assertTrue(domain.restocked)
        assertTrue(domain.walletCredited)
        assertTrue(domain.isActive)
        assertEquals(1, domain.items.size)
        assertEquals("Linen Shirt", domain.items.first().productName)
    }

    @Test
    fun rejectedReturnIsNotActiveWhileOtherStatusesAreActive() {
        assertFalse(ReturnRequestStatus.REJECTED.isActive)
        assertTrue(ReturnRequestStatus.PENDING.isActive)
        assertTrue(ReturnRequestStatus.APPROVED.isActive)
        assertTrue(ReturnRequestStatus.RECEIVED.isActive)
        assertTrue(ReturnRequestStatus.REFUNDED.isActive)
    }

    @Test
    fun submitReturnParamsSerializesExactRpcFields() {
        val params = SubmitReturnParamsDto(
            storeId = "00000000-0000-0000-0000-000000000001",
            orderId = "ord-123",
            requestType = ReturnRequestType.RETURN.rawValue,
            refundMethod = ReturnRefundMethod.WALLET.rawValue,
            reason = "damaged",
            customerNotes = "Box arrived torn",
            items = listOf(SubmitReturnItemParamDto(orderItemId = "oi-9", quantity = 2)),
        )
        val encoded = json.encodeToString(params)
        assertTrue(encoded.contains("\"p_store_id\""))
        assertTrue(encoded.contains("\"p_order_id\":\"ord-123\""))
        assertTrue(encoded.contains("\"p_request_type\":\"return\""))
        assertTrue(encoded.contains("\"p_refund_method\":\"wallet\""))
        assertTrue(encoded.contains("\"order_item_id\":\"oi-9\""))
    }

    @Test
    fun returnReasonsMatchesKnownCodesAndFallsBackForCustom() {
        assertTrue(ReturnReasons.presets.any { it.code == "wrong_size" })
        assertEquals("Custom reason", ReturnReasons.localize("Custom reason"))
    }
}
