package com.whitelabel.commerce.core.domain.repository

import com.whitelabel.commerce.core.domain.model.CartItem
import com.whitelabel.commerce.core.domain.model.Product
import kotlinx.coroutines.flow.Flow

interface CartRepository {
    val cartItems: Flow<List<CartItem>>
    val totalItemCount: Flow<Int>
    val subtotal: Flow<Double>

    suspend fun addProduct(
        product: Product,
        quantity: Int = 1,
        selectedSize: String? = null,
        selectedColor: String? = null,
    )

    suspend fun updateQuantity(lineKey: String, quantity: Int)

    suspend fun removeItem(lineKey: String)

    suspend fun settleReceipt(receipt: com.whitelabel.commerce.core.domain.model.SavedOrderReceipt)
    suspend fun clearCart()
}
