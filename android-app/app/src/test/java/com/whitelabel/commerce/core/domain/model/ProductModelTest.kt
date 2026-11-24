package com.whitelabel.commerce.core.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ProductModelTest {

    @Test
    fun `computes discount percentage only when oldPrice exceeds price`() {
        val discounted = Product(
            id = "p1",
            categoryId = "c1",
            slug = "tote",
            name = "حقيبة قماشية",
            price = 200.0,
            oldPrice = 250.0,
            stock = 5,
        )
        assertTrue(discounted.hasDiscount)
        assertEquals(20, discounted.discountPercent)

        val regular = discounted.copy(oldPrice = 200.0, stock = 0)
        assertFalse(regular.hasDiscount)
        assertNull(regular.discountPercent)
        assertFalse(regular.isInStock)
    }

    @Test
    fun `differentiates cart lines by product id, size, and color`() {
        val lineA = CartItem(
            productId = "p1",
            productName = "قميص",
            unitPrice = 300.0,
            quantity = 1,
            maxStock = 10,
            selectedSize = "M",
            selectedColor = "أبيض",
        )
        val lineB = lineA.copy(selectedSize = "L")

        assertNotEquals(lineA.lineKey, lineB.lineKey)
        assertEquals(600.0, lineA.copy(quantity = 2).lineTotal, 0.001)
    }
}
