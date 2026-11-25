package com.whitelabel.commerce.core.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class WishlistIdRowDto(
    @SerialName("product_id") val productId: String,
)

@Serializable
data class WishlistProductJoinDto(
    @SerialName("id") val id: String,
    @SerialName("product_id") val productId: String,
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("products") val product: ProductDto? = null,
)

@Serializable
data class ToggleWishlistResultDto(
    @SerialName("in_wishlist") val inWishlist: Boolean = false,
    @SerialName("wishlist_count") val wishlistCount: Int = 0,
)
