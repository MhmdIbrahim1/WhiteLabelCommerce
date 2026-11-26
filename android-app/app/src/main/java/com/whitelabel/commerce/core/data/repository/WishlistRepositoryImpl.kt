package com.whitelabel.commerce.core.data.repository

import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.BuildConfig
import com.whitelabel.commerce.core.data.remote.dto.ToggleWishlistResultDto
import com.whitelabel.commerce.core.data.remote.dto.WishlistIdRowDto
import com.whitelabel.commerce.core.data.remote.dto.WishlistProductJoinDto
import com.whitelabel.commerce.core.data.remote.runSuspendCatching
import com.whitelabel.commerce.core.domain.model.WishlistItem
import com.whitelabel.commerce.core.domain.model.WishlistToggleOutcome
import com.whitelabel.commerce.core.domain.repository.WishlistRepository
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order as SortOrder
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class WishlistRepositoryImpl @Inject constructor(
    private val supabase: SupabaseClient,
) : WishlistRepository {

    private val _wishlistedProductIds = MutableStateFlow<Set<String>>(emptySet())
    override val wishlistedProductIds: StateFlow<Set<String>> = _wishlistedProductIds.asStateFlow()

    private val _wishlistCount = MutableStateFlow(0)
    override val wishlistCount: StateFlow<Int> = _wishlistCount.asStateFlow()

    override suspend fun refreshWishlistIds(): Result<Set<String>> = runSuspendCatching {
        val userId = supabase.auth.currentUserOrNull()?.id
        if (userId == null) {
            _wishlistedProductIds.value = emptySet()
            _wishlistCount.value = 0
            return@runSuspendCatching emptySet()
        }

        val ids = supabase
            .from("wishlists")
            .select(Columns.list("product_id")) {
                filter {
                    eq("store_id", BuildConfig.STORE_ID)
                    eq("user_id", userId)
                }
            }
            .decodeList<WishlistIdRowDto>()
            .mapTo(linkedSetOf()) { it.productId }

        _wishlistedProductIds.value = ids
        _wishlistCount.value = ids.size
        ids
    }

    override suspend fun getWishlistItems(): Result<List<WishlistItem>> = runSuspendCatching {
        val userId = supabase.auth.currentUserOrNull()?.id
        if (userId == null) {
            _wishlistedProductIds.value = emptySet()
            _wishlistCount.value = 0
            return@runSuspendCatching emptyList()
        }

        val rows = supabase
            .from("wishlists")
            .select(Columns.raw("id,product_id,created_at,products($PRODUCT_COLUMNS)")) {
                filter {
                    eq("store_id", BuildConfig.STORE_ID)
                    eq("user_id", userId)
                }
                order(column = "created_at", order = SortOrder.DESCENDING)
            }
            .decodeList<WishlistProductJoinDto>()

        val items = rows.mapNotNull { row ->
            val product = row.product?.toDomain() ?: return@mapNotNull null
            if (!product.isActive) return@mapNotNull null
            WishlistItem(
                id = row.id,
                productId = row.productId,
                product = product,
                createdAt = row.createdAt,
            )
        }
        val ids = items.mapTo(linkedSetOf()) { it.productId }
        _wishlistedProductIds.value = ids
        _wishlistCount.value = ids.size
        items
    }

    override suspend fun toggleWishlist(productId: String): WishlistToggleOutcome {
        if (supabase.auth.currentUserOrNull() == null) {
            return WishlistToggleOutcome.RequiresSignIn
        }

        val previous = _wishlistedProductIds.value
        val wasSaved = productId in previous
        val optimistic = if (wasSaved) previous - productId else previous + productId
        _wishlistedProductIds.value = optimistic
        _wishlistCount.value = optimistic.size

        return runSuspendCatching {
            val dto = supabase.postgrest.rpc(
                function = "toggle_wishlist_item",
                parameters = buildJsonObject {
                    put("p_store_id", BuildConfig.STORE_ID)
                    put("p_product_id", productId)
                },
            ).decodeAs<ToggleWishlistResultDto>()

            val synced = if (dto.inWishlist) previous + productId else previous - productId
            _wishlistedProductIds.value = synced
            _wishlistCount.value = dto.wishlistCount.coerceAtLeast(synced.size)
            WishlistToggleOutcome.Toggled(
                inWishlist = dto.inWishlist,
                wishlistCount = dto.wishlistCount,
            )
        }.getOrElse { err ->
            // Revert optimistic state
            _wishlistedProductIds.value = previous
            _wishlistCount.value = previous.size
            WishlistToggleOutcome.Failure(localized("تعذر تحديث المفضلة. حاول مرة أخرى.", "Could not update your wishlist. Please try again."))
        }
    }
}
