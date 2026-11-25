package com.whitelabel.commerce.core.data.local

import com.whitelabel.commerce.core.domain.model.CartItem
import kotlinx.serialization.Serializable

@Serializable
data class CartItemEntity(
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
    fun toDomain(): CartItem = CartItem(
        productId = productId,
        productName = productName,
        productNameEn = productNameEn,
        unitPrice = unitPrice,
        regularPrice = regularPrice,
        flashSalePrice = flashSalePrice,
        flashSaleStartsAt = flashSaleStartsAt,
        flashSaleEndsAt = flashSaleEndsAt,
        oldPrice = oldPrice,
        imageUrl = imageUrl,
        quantity = quantity,
        maxStock = maxStock,
        selectedSize = selectedSize,
        selectedColor = selectedColor,
    )

    companion object {
        fun fromDomain(item: CartItem): CartItemEntity = CartItemEntity(
            productId = item.productId,
            productName = item.productName,
            productNameEn = item.productNameEn,
            unitPrice = item.unitPrice,
            regularPrice = item.regularPrice,
            flashSalePrice = item.flashSalePrice,
            flashSaleStartsAt = item.flashSaleStartsAt,
            flashSaleEndsAt = item.flashSaleEndsAt,
            oldPrice = item.oldPrice,
            imageUrl = item.imageUrl,
            quantity = item.quantity,
            maxStock = item.maxStock,
            selectedSize = item.selectedSize,
            selectedColor = item.selectedColor,
        )
    }
}
