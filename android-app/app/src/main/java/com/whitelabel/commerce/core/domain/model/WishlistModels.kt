package com.whitelabel.commerce.core.domain.model

data class WishlistItem(
    val id: String,
    val productId: String,
    val product: Product,
    val createdAt: String = "",
)

sealed interface WishlistToggleOutcome {
    data class Toggled(
        val inWishlist: Boolean,
        val wishlistCount: Int,
    ) : WishlistToggleOutcome

    data object RequiresSignIn : WishlistToggleOutcome

    data class Failure(val message: String) : WishlistToggleOutcome
}
