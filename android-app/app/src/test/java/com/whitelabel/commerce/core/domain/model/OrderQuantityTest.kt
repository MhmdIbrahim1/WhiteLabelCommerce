package com.whitelabel.commerce.core.domain.model

import org.junit.Assert.assertEquals
import org.junit.Test

class OrderQuantityTest {
    private val red = CartItem(productId = "p", productName = "P", unitPrice = 10.0, quantity = 2,
        maxStock = 8, productStock = 38, selectedColor = "Red")
    private val blue = red.copy(maxStock = 30, selectedColor = "Blue", quantity = 1)
    @Test fun sharedProductLimitSpansAllColors() {
        assertEquals(1, listOf(red, blue).remainingQuantity(blue, 4))
    }
    @Test fun productOverrideCanRaiseOrLowerStoreLimit() {
        val lines = listOf(red, blue)
        assertEquals(5, lines.remainingQuantity(blue.copy(maxOrderQty = 8), 2))
        assertEquals(-1, lines.remainingQuantity(blue.copy(maxOrderQty = 2), 10))
    }
    @Test fun stockBoundsUnlimitedAndLegacyCarts() {
        assertEquals(6, listOf(red, blue).remainingQuantity(red, null))
        val legacy = red.copy(maxStock = 4, productStock = null)
        assertEquals(1, listOf(legacy, blue).remainingQuantity(legacy, null))
    }
    @Test fun anotherProductDoesNotConsumeAllowance() {
        assertEquals(2, listOf(red, blue.copy(productId = "other")).remainingQuantity(red, 4))
    }
    @Test fun shortOrderNumberIsIsolatedForLettersAndDigits() {
        assertEquals("\u2066#EFDF14BC\u2069", formatOrderNumber("efdf14bc-0000"))
        assertEquals("\u2066#6FF71AF5\u2069", formatOrderNumber("6ff71af5-0000"))
    }
}
