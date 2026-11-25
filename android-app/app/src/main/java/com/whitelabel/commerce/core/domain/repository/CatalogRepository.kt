package com.whitelabel.commerce.core.domain.repository

import com.whitelabel.commerce.core.domain.model.Category
import com.whitelabel.commerce.core.domain.model.Product

data class CatalogSearchResult(
    val products: List<Product>,
    val isClosestSmartMatch: Boolean = false,
)

interface CatalogRepository {
    suspend fun getCategories(): Result<List<Category>>

    suspend fun getActiveProducts(
        categoryId: String? = null,
        searchQuery: String? = null,
        limit: Int? = null,
    ): Result<List<Product>>

    /**
     * Bilingual smart search backed by `public.search_products_fast` RPC (strictly scoped by
     * `BuildConfig.STORE_ID`) with a 50-entry / 60s TTL in-memory LRU cache.
     */
    suspend fun searchProducts(
        query: String,
        categoryId: String? = null,
        limit: Int = 24,
        offset: Int = 0,
    ): Result<CatalogSearchResult>

    suspend fun getProductById(productId: String): Result<Product?>

    suspend fun getProductBySlug(slug: String): Result<Product?>

    suspend fun getRelatedProducts(
        productId: String,
        limit: Int = 6,
    ): Result<List<Product>>

    suspend fun getCartUpsellProducts(
        cartProductIds: List<String>,
        gapAmount: Double = 0.0,
        limit: Int = 4,
    ): Result<List<Product>>
}
