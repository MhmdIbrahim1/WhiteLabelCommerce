package com.whitelabel.commerce.core.data.repository

import com.whitelabel.commerce.BuildConfig
import com.whitelabel.commerce.core.data.remote.dto.CategoryDto
import com.whitelabel.commerce.core.data.remote.dto.ProductDto
import com.whitelabel.commerce.core.data.remote.runSuspendCatching
import com.whitelabel.commerce.core.domain.model.Category
import com.whitelabel.commerce.core.domain.model.Product
import com.whitelabel.commerce.core.domain.repository.CatalogRepository
import com.whitelabel.commerce.core.domain.repository.CatalogSearchResult
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order as SortOrder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.LinkedHashMap
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CatalogRepositoryImpl @Inject constructor(
    private val supabase: SupabaseClient,
) : CatalogRepository {

    private data class CacheEntry(
        val result: CatalogSearchResult,
        val expiresAtMs: Long,
    )

    // Bounded 50-entry / 60s TTL LRU cache matching web-store Phase 7d scalable search contract.
    private val searchCacheLock = Any()
    private val searchCache = object : LinkedHashMap<String, CacheEntry>(64, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, CacheEntry>?): Boolean =
            size > MAX_CACHE_ENTRIES
    }

    override suspend fun getCategories(): Result<List<Category>> = runSuspendCatching {
        supabase
            .from("categories")
            .select(Columns.raw("*,products!inner(store_id,is_active)")) {
                filter {
                    eq("products.store_id", BuildConfig.STORE_ID)
                    eq("products.is_active", true)
                }
                order(column = "name", order = SortOrder.ASCENDING)
            }
            .decodeList<CategoryDto>()
            .distinctBy { it.id }
            .map { it.toDomain() }
    }

    override suspend fun getActiveProducts(
        categoryId: String?,
        searchQuery: String?,
        limit: Int?,
    ): Result<List<Product>> {
        val trimmedQuery = searchQuery?.trim()?.takeIf { it.isNotEmpty() }
        if (trimmedQuery != null) {
            return searchProducts(
                query = trimmedQuery,
                categoryId = categoryId,
                limit = limit ?: 24,
                offset = 0,
            ).map { it.products }
        }

        return runSuspendCatching {
            val dtos = try {
                queryActiveProducts(
                    categoryId = categoryId,
                    limit = limit,
                    orderByCreatedAt = true,
                )
            } catch (_: Exception) {
                queryActiveProducts(
                    categoryId = categoryId,
                    limit = limit,
                    orderByCreatedAt = false,
                )
            }
            dtos.map { it.toDomain() }
        }
    }

    override suspend fun searchProducts(
        query: String,
        categoryId: String?,
        limit: Int,
        offset: Int,
    ): Result<CatalogSearchResult> = runSuspendCatching {
        val cleanQuery = query.trim()
        if (cleanQuery.isEmpty()) {
            val all = getActiveProducts(categoryId = categoryId, searchQuery = null, limit = limit)
                .getOrThrow()
            return@runSuspendCatching CatalogSearchResult(products = all, isClosestSmartMatch = false)
        }

        val cacheKey = buildCacheKey(cleanQuery, categoryId, limit, offset)
        val now = System.currentTimeMillis()
        synchronized(searchCacheLock) {
            searchCache[cacheKey]?.takeIf { it.expiresAtMs > now }?.let { cached ->
                return@runSuspendCatching cached.result
            }
        }

        val rpcProducts = runCatching {
            val params = buildJsonObject {
                put("p_store_id", BuildConfig.STORE_ID)
                put("p_query", cleanQuery)
                put("p_limit", limit.coerceIn(1, 50))
                if (categoryId.isNullOrBlank()) {
                    put("p_category_id", JsonNull)
                } else {
                    put("p_category_id", categoryId)
                }
                put("p_offset", offset.coerceAtLeast(0))
            }
            supabase.postgrest
                .rpc(function = "search_products_fast", parameters = params)
                .decodeList<ProductDto>()
                .map { it.toDomain() }
        }.getOrElse {
            // Safe bilingual fallback across both Arabic & English title/description columns
            fallbackBilingualSearch(cleanQuery, categoryId, limit)
        }

        val isClosestOnly = rpcProducts.isNotEmpty() && rpcProducts.none { product ->
            val mt = product.matchType
            mt == null || mt == "exact" || mt == "synonym"
        }
        val result = CatalogSearchResult(
            products = rpcProducts,
            isClosestSmartMatch = isClosestOnly,
        )

        synchronized(searchCacheLock) {
            searchCache[cacheKey] = CacheEntry(result = result, expiresAtMs = now + CACHE_TTL_MS)
        }

        result
    }

    private suspend fun fallbackBilingualSearch(
        query: String,
        categoryId: String?,
        limit: Int,
    ): List<Product> {
        val all = queryActiveProducts(categoryId = categoryId, limit = 100, orderByCreatedAt = false)
            .map { it.toDomain() }
        val q = query.lowercase()
        return all.filter { p ->
            p.name.lowercase().contains(q) ||
                (p.nameEn?.lowercase()?.contains(q) == true) ||
                p.description.lowercase().contains(q) ||
                (p.descriptionEn?.lowercase()?.contains(q) == true) ||
                p.specifications.any { spec ->
                    spec.keyAr.lowercase().contains(q) ||
                        spec.keyEn.lowercase().contains(q) ||
                        spec.valueAr.lowercase().contains(q) ||
                        spec.valueEn.lowercase().contains(q)
                }
        }.take(limit)
    }

    private suspend fun queryActiveProducts(
        categoryId: String?,
        limit: Int?,
        orderByCreatedAt: Boolean,
    ): List<ProductDto> = supabase
        .from("products")
        .select {
            filter {
                eq("store_id", BuildConfig.STORE_ID)
                eq("is_active", true)
                if (!categoryId.isNullOrBlank()) {
                    eq("category_id", categoryId)
                }
            }
            if (orderByCreatedAt) {
                order(column = "created_at", order = SortOrder.DESCENDING)
            } else {
                order(column = "name", order = SortOrder.ASCENDING)
            }
            if (limit != null && limit > 0) {
                limit(limit.toLong())
            }
        }
        .decodeList()

    override suspend fun getProductById(productId: String): Result<Product?> = runSuspendCatching {
        supabase
            .from("products")
            .select {
                filter {
                    eq("id", productId)
                    eq("store_id", BuildConfig.STORE_ID)
                    eq("is_active", true)
                }
                limit(1)
            }
            .decodeList<ProductDto>()
            .firstOrNull()
            ?.toDomain()
    }

    override suspend fun getProductBySlug(slug: String): Result<Product?> = runSuspendCatching {
        supabase
            .from("products")
            .select {
                filter {
                    eq("slug", slug)
                    eq("store_id", BuildConfig.STORE_ID)
                    eq("is_active", true)
                }
                limit(1)
            }
            .decodeList<ProductDto>()
            .firstOrNull()
            ?.toDomain()
    }

    private fun buildCacheKey(query: String, categoryId: String?, limit: Int, offset: Int): String =
        "${BuildConfig.STORE_ID}|${categoryId.orEmpty()}|$limit|$offset|${query.lowercase()}"

    private companion object {
        const val MAX_CACHE_ENTRIES = 50
        const val CACHE_TTL_MS = 60_000L
    }
}
