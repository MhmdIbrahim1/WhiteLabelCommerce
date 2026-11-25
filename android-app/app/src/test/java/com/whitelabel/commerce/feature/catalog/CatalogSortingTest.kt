package com.whitelabel.commerce.feature.catalog

import com.whitelabel.commerce.core.domain.model.Product
import org.junit.Assert.assertEquals
import org.junit.Test

class CatalogSortingTest {

    private val futureIso = "2099-12-31T23:59:59Z"
    private val pastIso = "2020-01-01T00:00:00Z"

    private val products = listOf(
        Product(
            id = "1",
            categoryId = "c1",
            slug = "a",
            name = "A",
            price = 250.0,
            stock = 5,
            avgRating = 4.6,
            reviewCount = 12,
            createdAt = "2026-02-01T10:00:00Z",
        ),
        Product(
            id = "2",
            categoryId = "c1",
            slug = "b",
            name = "B",
            price = 120.0,
            stock = 0,
            avgRating = 3.5,
            reviewCount = 4,
            createdAt = "2026-03-01T10:00:00Z",
        ),
        Product(
            id = "3",
            categoryId = "c2",
            slug = "c",
            name = "C",
            price = 490.0,
            flashSalePrice = 200.0,
            flashSaleStartsAt = pastIso,
            flashSaleEndsAt = futureIso,
            stock = 8,
            avgRating = 4.9,
            reviewCount = 3,
            createdAt = "2026-01-01T10:00:00Z",
        ),
    )

    @Test
    fun `sorts displayed products by effective price ascending, descending, top rated, and newest`() {
        val lowToHigh = CatalogUiState(
            rawProducts = products,
            sortOption = CatalogSortOption.PRICE_LOW_TO_HIGH,
        ).displayedProducts
        // Effective prices: #2 = 120, #3 = 200 (flash), #1 = 250
        assertEquals(listOf("2", "3", "1"), lowToHigh.map { it.id })

        val highToLow = CatalogUiState(
            rawProducts = products,
            sortOption = CatalogSortOption.PRICE_HIGH_TO_LOW,
        ).displayedProducts
        assertEquals(listOf("1", "3", "2"), highToLow.map { it.id })

        val topRated = CatalogUiState(
            rawProducts = products,
            sortOption = CatalogSortOption.TOP_RATED,
        ).displayedProducts
        assertEquals(listOf("3", "1", "2"), topRated.map { it.id })

        val newest = CatalogUiState(
            rawProducts = products,
            sortOption = CatalogSortOption.NEWEST,
        ).displayedProducts
        assertEquals(listOf("2", "1", "3"), newest.map { it.id })
    }

    @Test
    fun `filters by flash deals only, in stock only, 4-star rating, and price range`() {
        val flashOnly = CatalogUiState(
            rawProducts = products,
            flashDealsOnly = true,
        )
        assertEquals(listOf("3"), flashOnly.displayedProducts.map { it.id })
        assertEquals(1, flashOnly.activeFilterCount)

        val inStockFourStar = CatalogUiState(
            rawProducts = products,
            inStockOnly = true,
            minRating = 4.0,
            priceMin = 150.0,
            priceMax = 220.0,
        )
        assertEquals(listOf("3"), inStockFourStar.displayedProducts.map { it.id })
        assertEquals(3, inStockFourStar.activeFilterCount)
    }
}
