package com.whitelabel.commerce.core.domain.repository

import com.whitelabel.commerce.core.domain.model.WishlistItem
import com.whitelabel.commerce.core.domain.model.WishlistToggleOutcome
import kotlinx.coroutines.flow.StateFlow

interface WishlistRepository {
    val wishlistedProductIds: StateFlow<Set<String>>
    val wishlistCount: StateFlow<Int>
    suspend fun refreshWishlistIds(): Result<Set<String>>
    suspend fun getWishlistItems(): Result<List<WishlistItem>>
    suspend fun toggleWishlist(productId: String): WishlistToggleOutcome
}
