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
import com.whitelabel.commerce.core.domain.repository.SearchCorrection
import com.whitelabel.commerce.core.domain.search.LocalCatalogSearch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
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

    @Volatile private var categories: List<Category> = emptyList()
    @Volatile private var browsed: List<Product> = emptyList()
    private val searchCacheLock = Any()
    private val searchCache = object : LinkedHashMap<String, CacheEntry>(64, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, CacheEntry>?): Boolean =
            size > MAX_CACHE_ENTRIES
    }

    override suspend fun getCategories(): Result<List<Category>> = runSuspendCatching {
        supabase
            .from("categories")
            .select(Columns.raw(CATEGORY_COLUMNS)) {
                filter {
                    eq("store_id", BuildConfig.STORE_ID)
                    eq("products.store_id", BuildConfig.STORE_ID)
                    eq("products.is_active", true)
                }
                order(column = "name", order = SortOrder.ASCENDING)
            }
            .decodeList<CategoryDto>()
            .distinctBy { it.id }
            .map { it.toDomain() }.also { categories = it }
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
            dtos.map { it.toDomain() }.also { rows ->
                synchronized(searchCacheLock) {
                    browsed = when {
                        categoryId == null && limit == null -> rows
                        limit == null -> browsed.filterNot { it.categoryId == categoryId } + rows
                        else -> (rows + browsed).distinctBy { it.id }
                    }
                }
            }
        }
    }

    override suspend fun searchProducts(
        query: String,
        categoryId: String?,
        limit: Int,
        offset: Int,
        exact: Boolean,
    ): Result<CatalogSearchResult> = runSuspendCatching {
        val cleanQuery = query.trim().take(100)
        if (cleanQuery.isEmpty()) {
            val all = getActiveProducts(categoryId = categoryId, searchQuery = null, limit = limit)
                .getOrThrow()
            return@runSuspendCatching CatalogSearchResult(products = all, isClosestSmartMatch = false)
        }

        val cacheKey = "${BuildConfig.STORE_ID}|${categoryId.orEmpty()}|$limit|$offset|$exact|$cleanQuery"
        val now = System.currentTimeMillis()
        synchronized(searchCacheLock) {
            searchCache[cacheKey]?.takeIf { it.expiresAtMs > now }?.let { cached ->
                return@runSuspendCatching cached.result
            }
        }

        val params = buildJsonObject {
            put("p_store_id", BuildConfig.STORE_ID)
            put("p_query", cleanQuery)
            put("p_exact_query", exact)
            put("p_limit", limit.coerceIn(1, 100))
            put("p_offset", offset.coerceAtLeast(0))
            if (!categoryId.isNullOrBlank()) put("p_category_id", categoryId)
        }
        val rows = runSuspendCatching {
            supabase.postgrest.rpc("catalog_products_page", params).decodeList<ProductDto>()
        }.getOrElse { failure ->
            val snapshot = browsed
            if (snapshot.isEmpty()) throw failure
            return@runSuspendCatching withContext(Dispatchers.Default) {
                val scoped = snapshot.filter { categoryId == null || it.categoryId == categoryId }
                val local = LocalCatalogSearch.search(scoped, categories, cleanQuery, exact)
                local.copy(products = local.products.drop(offset.coerceAtLeast(0)).take(limit.coerceIn(1, 100)))
            }
        }
        val first = rows.firstOrNull()
        val correction = if (first?.wasAutoCorrected == true && first.effectiveQuery != null && first.correctedFrom != null) {
            SearchCorrection(first.effectiveQuery, first.correctedFrom, first.correctionReason)
        } else null
        val result = CatalogSearchResult(rows.map { it.toDomain() }, !exact && first?.matchTier == 3, correction)

        synchronized(searchCacheLock) {
            searchCache[cacheKey] = CacheEntry(result = result, expiresAtMs = now + CACHE_TTL_MS)
        }

        result
    }

    private suspend fun queryActiveProducts(
        categoryId: String?,
        limit: Int?,
        orderByCreatedAt: Boolean,
    ): List<ProductDto> = supabase
        .from("products")
        .select(Columns.raw(PRODUCT_COLUMNS)) {
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
            .select(Columns.raw(PRODUCT_COLUMNS)) {
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
            .select(Columns.raw(PRODUCT_COLUMNS)) {
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

    override suspend fun getRelatedProducts(
        productId: String,
        limit: Int,
    ): Result<List<Product>> = runSuspendCatching {
        val params = buildJsonObject {
            put("p_store_id", BuildConfig.STORE_ID)
            put("p_product_id", productId)
            put("p_limit", limit.coerceIn(1, 24))
        }
        supabase.postgrest
            .rpc(function = "get_related_products", parameters = params)
            .decodeList<ProductDto>()
            .map { it.toDomain() }
    }

    override suspend fun getCartUpsellProducts(
        cartProductIds: List<String>,
        gapAmount: Double,
        limit: Int,
    ): Result<List<Product>> = runSuspendCatching {
        val params = buildJsonObject {
            put("p_store_id", BuildConfig.STORE_ID)
            put(
                "p_cart_product_ids",
                buildJsonArray {
                    cartProductIds.distinct().forEach { add(JsonPrimitive(it)) }
                },
            )
            put("p_gap_amount", gapAmount.coerceAtLeast(0.0))
            put("p_limit", limit.coerceIn(1, 12))
        }
        supabase.postgrest
            .rpc(function = "get_cart_upsell_products", parameters = params)
            .decodeList<ProductDto>()
            .map { it.toDomain() }
    }

    private companion object {
        const val MAX_CACHE_ENTRIES = 50
        const val CACHE_TTL_MS = 60_000L
    }
}
