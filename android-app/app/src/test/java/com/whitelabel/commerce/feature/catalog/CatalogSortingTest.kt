package com.whitelabel.commerce.feature.catalog

import com.whitelabel.commerce.core.domain.model.Product
import org.junit.Assert.assertEquals
import org.junit.Test

class CatalogSortingTest {

    private val products = listOf(
        Product(id = "1", categoryId = "c1", slug = "a", name = "A", price = 250.0, stock = 5),
        Product(id = "2", categoryId = "c1", slug = "b", name = "B", price = 120.0, stock = 5),
        Product(id = "3", categoryId = "c1", slug = "c", name = "C", price = 490.0, stock = 5),
    )

    @Test
    fun `sorts displayed products by price ascending and descending`() {
        val lowToHigh = CatalogUiState(
            rawProducts = products,
            sortOption = CatalogSortOption.PRICE_LOW_TO_HIGH,
        ).displayedProducts
        assertEquals(listOf("2", "1", "3"), lowToHigh.map { it.id })

        val highToLow = CatalogUiState(
            rawProducts = products,
            sortOption = CatalogSortOption.PRICE_HIGH_TO_LOW,
        ).displayedProducts
        assertEquals(listOf("3", "1", "2"), highToLow.map { it.id })
    }
}
