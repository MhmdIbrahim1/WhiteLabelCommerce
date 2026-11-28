package com.whitelabel.commerce.core.data.repository

import com.whitelabel.commerce.core.data.local.CartItemEntity
import com.whitelabel.commerce.core.data.local.SavedOrderLineEntity
import com.whitelabel.commerce.core.domain.model.OrderItem
import com.whitelabel.commerce.core.domain.model.Product
import com.whitelabel.commerce.core.domain.model.ProductVariant
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BuyAgainTest {
    private val shirt = Product(
        id = "shirt", categoryId = "tops", name = "Current name", price = 29.0,
        colors = listOf("Red", "Brown", "Yellow"), sizes = listOf("M"), stock = 10,
        colorImages = mapOf("Brown" to "https://example.com/brown.jpg"),
        variants = listOf(ProductVariant("Red", "M", 0), ProductVariant("Brown", "M", 5), ProductVariant("Yellow", "M", 5)),
    )
    private val cart = mutableListOf<CartItemEntity>()
    private fun line(color: String? = "Brown", units: Int = 1, size: String? = "M", id: String? = "shirt") =
        OrderItem("line", "order", id, "Old name", 17.0, units, size, color)

    @Test fun usesExactStockAndLivePriceAndImageForEachVariant() {
        val added = cart.addOrderItems(listOf(line("Red", 2), line("Brown", 7), line("Yellow", 2)),
            mapOf(shirt.id to shirt), null)
        assertEquals(7L, added)
        assertEquals(listOf("Brown", "Yellow"), cart.map { it.selectedColor })
        assertEquals(listOf(5, 2), cart.map { it.quantity })
        assertEquals("M", cart.first().selectedSize)
        assertEquals("Current name", cart.first().productName)
        assertEquals(29.0, cart.first().unitPrice, 0.0)
        assertEquals(shirt.colorImages["Brown"], cart.first().imageUrl)
    }

    @Test fun clampsAgainstExistingCartAndRepeatedLinesAcrossTheWholeProduct() {
        val products = mapOf(shirt.id to shirt.copy(maxOrderQty = 6))
        cart.addOrderItems(listOf(line(units = 3)), products, 2)
        val added = cart.addOrderItems(listOf(line(units = 1), line(units = 4), line("Yellow", 3)), products, 2)
        assertEquals(3L, added)
        assertEquals(listOf(5, 1), cart.map { it.quantity })
        assertEquals(0L, cart.addOrderItems(listOf(line("Yellow", 2)), products, 2))
    }

    @Test fun appliesDefaultLimitOnlyToItsOwnProduct() {
        val book = Product(id = "book", categoryId = "books", name = "Book", price = 5.0, stock = 8)
        val products = mapOf(shirt.id to shirt, book.id to book)
        val added = cart.addOrderItems(listOf(line(units = 3), line("Yellow", 2), line(null, 3, null, "book")), products, 2)
        assertEquals(4L, added)
        assertEquals(listOf(shirt.id, book.id), cart.map { it.productId })
        assertEquals(listOf(2, 2), cart.map { it.quantity })
    }

    @Test fun deletedInactiveAndMissingOrUnavailableCombinationsAreSkipped() {
        val products = mapOf(shirt.id to shirt, "hidden" to shirt.copy(id = "hidden", isActive = false))
        val lines = listOf(line(id = null), line(id = "  "), line(id = "deleted"), line(id = "hidden"),
            line(color = "Red"), line(color = "Blue"), line(size = "L"), line(size = null), line(units = 0))
        assertEquals(0L, cart.addOrderItems(lines, products, null))
        assertTrue(cart.isEmpty())
    }

    @Test fun legacySharedStockStillRequiresOriginalColorAndSize() {
        val products = mapOf(shirt.id to shirt.copy(variants = emptyList(), stock = 4))
        val lines = listOf(line("Retired", 2), line(size = "Retired"), line(size = null),
            line("Brown", 3), line("Yellow", 3))
        assertEquals(4L, cart.addOrderItems(lines, products, null))
        assertEquals(listOf("Brown", "Yellow"), cart.map { it.selectedColor })
        assertEquals(listOf(3, 1), cart.map { it.quantity })
    }

    @Test fun deviceReceiptsWithMissingOrNullProductIdsRetainTheirLine() {
        val json = Json { coerceInputValues = true }
        for (idField in listOf("", "\"productId\":null,")) {
            val raw = """{${idField}"productName":"Archived","unitPrice":5,"quantity":2}"""
            val line = json.decodeFromString<SavedOrderLineEntity>(raw).toDomain()
            assertTrue(line.productId.isBlank())
            assertEquals("Archived", line.productName)
            assertEquals(10.0, line.lineTotal, 0.0)
        }
    }
}
