package com.whitelabel.commerce.core.domain.model

data class CartItem(
    val productId: String,
    val productName: String,
    val productNameEn: String? = null,
    val unitPrice: Double,
    val oldPrice: Double? = null,
    val imageUrl: String? = null,
    val quantity: Int,
    val maxStock: Int,
    val selectedSize: String? = null,
    val selectedColor: String? = null,
) {
    /**
     * Uniquely identifies a cart line by product + selected variant combination.
     */
    val lineKey: String
        get() = "$productId|${selectedSize.orEmpty()}|${selectedColor.orEmpty()}"

    val displayName: String get() = com.whitelabel.commerce.core.designsystem.localized(productName, productNameEn?.ifBlank { null } ?: productName)
    val lineTotal: Double
        get() = unitPrice * quantity
}
