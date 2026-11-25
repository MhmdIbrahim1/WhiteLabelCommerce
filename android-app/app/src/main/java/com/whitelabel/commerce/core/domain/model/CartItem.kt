package com.whitelabel.commerce.core.domain.model

data class CartItem(
    val productId: String,
    val productName: String,
    val productNameEn: String? = null,
    val unitPrice: Double,
    val regularPrice: Double? = null,
    val flashSalePrice: Double? = null,
    val flashSaleStartsAt: String? = null,
    val flashSaleEndsAt: String? = null,
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

    val displayName: String
        get() = com.whitelabel.commerce.core.designsystem.localized(
            productName,
            productNameEn?.ifBlank { null } ?: productName,
        )

    fun effectiveUnitPrice(nowMillis: Long = System.currentTimeMillis()): Double {
        val base = regularPrice ?: unitPrice
        return if (flashSalePrice != null || flashSaleEndsAt != null) {
            FlashSalePricing.effectivePrice(
                regularPrice = base,
                flashSalePrice = flashSalePrice,
                flashSaleStartsAt = flashSaleStartsAt,
                flashSaleEndsAt = flashSaleEndsAt,
                nowMillis = nowMillis,
            )
        } else {
            unitPrice
        }
    }

    val lineTotal: Double
        get() = effectiveUnitPrice() * quantity
}
