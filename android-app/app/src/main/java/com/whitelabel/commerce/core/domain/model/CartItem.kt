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
    val productStock: Int? = null,
    val maxOrderQty: Int? = null,
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

internal fun List<CartItem>.remainingQuantity(productId: String, size: String?, color: String?, skuStock: Int,
    productStock: Int, override: Int?, defaultLimit: Int?): Int {
    val productLimit = minOf(productStock, override ?: defaultLimit ?: productStock)
    var total = 0L
    var selected = 0L
    for (line in this) {
        if (line.productId != productId) continue
        total += line.quantity
        if (line.selectedSize.orEmpty() == size.orEmpty() && line.selectedColor.orEmpty() == color.orEmpty()) selected += line.quantity
    }
    return minOf(productLimit - total, skuStock - selected).coerceAtLeast(Int.MIN_VALUE.toLong()).toInt()
}

internal fun List<CartItem>.remainingQuantity(line: CartItem, defaultLimit: Int?) = remainingQuantity(
    line.productId, line.selectedSize, line.selectedColor, line.maxStock, line.productStock ?: line.maxStock, line.maxOrderQty, defaultLimit)

internal fun quantityLimitHint() = com.whitelabel.commerce.core.designsystem.localized(
    "بلغت الحد المتاح لهذا المنتج في الطلب.", "Quantity limit reached for this order.")
