package com.whitelabel.commerce.core.domain.repository

import com.whitelabel.commerce.core.domain.model.CartItem
import com.whitelabel.commerce.core.domain.model.OrderItem
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
    ): Int

    /** Add original selections using freshly loaded products in one local cart transaction. */
    suspend fun addOrderItems(items: List<OrderItem>, products: Map<String, Product>): Long

    suspend fun refreshInventory()

    suspend fun updateQuantity(lineKey: String, quantity: Int)

    suspend fun removeItem(lineKey: String)

    suspend fun settleReceipt(receipt: com.whitelabel.commerce.core.domain.model.SavedOrderReceipt)
    suspend fun clearCart()

    /**
     * Non-blocking omnichannel abandoned cart sync to `public.upsert_abandoned_cart` (`p_source = 'android'`).
     */
    fun syncAbandonedCartAsync(currency: String = "EGP")

    /**
     * Marks the authenticated shopper's Android cart as recovered via `public.mark_abandoned_cart_recovered`.
     */
    fun markAbandonedCartRecoveredAsync(orderId: String? = null)
}
