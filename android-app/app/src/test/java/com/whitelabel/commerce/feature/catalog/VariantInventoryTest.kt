package com.whitelabel.commerce.feature.catalog

import com.whitelabel.commerce.BuildConfig
import com.whitelabel.commerce.core.data.remote.dto.ProductDto
import com.whitelabel.commerce.core.domain.model.Product
import com.whitelabel.commerce.core.domain.model.ProductVariant
import com.whitelabel.commerce.core.domain.model.VariantInventory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VariantInventoryTest {
    private val product = Product(
        id = "shirt", name = "قميص", categoryId = "clothes", price = 100.0, stock = 10,
        colors = listOf("أحمر", "بني", "أصفر"),
        variants = listOf(
            ProductVariant("أحمر", "", 0), ProductVariant("بني", "", 5), ProductVariant("أصفر", "", 5),
        ),
    )

    @Test fun soldOutColorDoesNotDisableItsSiblings() {
        val red = ProductDetailUiState(product = product, selectedColor = "أحمر")
        assertEquals(10, product.inventory.totalStock)
        assertTrue(product.inventory.hasAnyInStockVariant)
        assertEquals("بني", product.inventory.first?.color)
        assertEquals(0, red.selectedStock)
        assertFalse(red.canAddToCart)
        for (color in listOf("بني", "أصفر")) {
            val sibling = red.selectOption(color, null)
            assertEquals(5, sibling.selectedStock)
            assertEquals(5, sibling.remaining)
            assertTrue(sibling.copy(quantity = 5).canAddToCart)
            assertFalse(sibling.copy(quantity = 6).canAddToCart)
        }
    }

    @Test fun firstSizePreservesFirstAvailablePairForEachColor() {
        val options = VariantInventory(listOf(
            ProductVariant("red", "S", 0), ProductVariant("brown", "XL", 2),
            ProductVariant("red", "M", 3), ProductVariant("brown", "S", 4),
            ProductVariant("red", "L", 5), ProductVariant("yellow", "M", 0),
        ))
        assertEquals(ProductVariant("brown", "XL", 2), options.first)
        assertEquals("M", options.firstSize("red"))
        assertEquals("XL", options.firstSize("brown"))
        assertNull(options.firstSize("yellow"))
        assertEquals(8, options.colorStock("red", 99))
        assertEquals(0, options.stock("red", "XL", 99))
    }

    @Test fun allSoldOutAndUntrackedInventoryUseTheirOwnStock() {
        val soldOut = VariantInventory(listOf(ProductVariant("", "M", 0)))
        assertFalse(soldOut.hasAnyInStockVariant)
        assertEquals(0, soldOut.stock(null, "M", 8))
        val untracked = VariantInventory(emptyList())
        assertFalse(untracked.tracked)
        assertEquals(8, untracked.stock(null, "M", 8))
        assertEquals(8, untracked.colorStock("red", 8))
    }

    @Test fun restockFeedbackBelongsToSelectedOption() {
        val subscribed = ProductDetailUiState(
            product = product, selectedColor = "أحمر", selectedSize = "S",
            restockSubscribed = true, restockError = "previous", isSubscribingRestock = true,
        )
        assertTrue(subscribed.selectOption("أحمر", "S").restockSubscribed)
        for (next in listOf(subscribed.selectOption("بني", "S"), subscribed.selectOption("أحمر", "M"))) {
            assertFalse(next.restockSubscribed)
            assertFalse(next.isSubscribingRestock)
            assertNull(next.restockError)
        }
    }

    @Test fun colorPhotosResolveStoragePathsPreserveRemoteUrlsAndDropBlanks() {
        val remote = "https://cdn.example.com/brown.jpg"
        val mapped = ProductDto(
            id = "shirt", categoryId = "clothes", name = "قميص", price = 100.0, imagePath = remote,
            colorImages = mapOf("أحمر" to " /shirt/red.jpg ", "بني" to remote, "أصفر" to "  "),
        ).toDomain()
        val base = BuildConfig.SUPABASE_URL.trimEnd('/')
        val redImage = base.takeIf { it.isNotEmpty() }?.let { "$it/storage/v1/object/public/product-images/shirt/red.jpg" }
        assertEquals(redImage, mapped.colorImages["أحمر"])
        assertEquals(remote, mapped.imageFor("بني"))
        assertFalse("أصفر" in mapped.colorImages)
        assertEquals(remote, mapped.imageFor("أصفر"))
    }
}
