package com.whitelabel.commerce.feature.orders

import com.whitelabel.commerce.core.data.remote.dto.OrderDto
import com.whitelabel.commerce.core.domain.model.OrderStatus
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test

class OrderListSafetyTest {
    @Test fun sameCheckoutCanAppearInBothSectionsAndSurviveRefresh() {
        val ids = listOf("ABC", "abc", " ", " def ")
        val rows = ids.distinctOrders { it }
        val keys = rows.map(::receiptListKey) + rows.reversed().map(::accountListKey)
        assertEquals(4, keys.size)
        assertEquals(keys.size, keys.toSet().size)
        assertEquals(receiptListKey("ABC"), receiptListKey(" abc "))
    }

    @Test fun freshPendingOrderDecodesBeforeTotalsTrackingOrItemsAreReady() {
        for (relation in listOf("", ""","order_items":null""", ""","order_items":[]""", ""","order_items":[null]""")) {
            val dto = Json.decodeFromString<OrderDto>(
                """{"id":"new","shipping_address":"Cairo","currency":"EGP","shipping_fee":0,"created_at":"","total":null$relation}""",
            )
            val order = requireNotNull(dto.toDomainOrNull())
            assertEquals(OrderStatus.PENDING, order.status)
            assertNull(order.total)
            assertNull(order.trackingNumber)
            assertTrue(order.items.isEmpty())
            assertEquals("", formatOrderDate(order.createdAt))
            assertNull(dto.copy(id = " ").toDomainOrNull())
            assertNull(dto.copy(id = null).toDomainOrNull())
        }
    }
}
