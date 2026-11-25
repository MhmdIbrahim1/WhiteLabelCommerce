package com.whitelabel.commerce.core.data.repository

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.whitelabel.commerce.core.data.local.CartItemEntity
import com.whitelabel.commerce.core.domain.model.CartItem
import com.whitelabel.commerce.core.domain.model.Product
import com.whitelabel.commerce.core.domain.repository.CartRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CartRepositoryImpl @Inject constructor(
    private val dataStore: DataStore<Preferences>,
    private val json: Json,
) : CartRepository {

    override val cartItems: Flow<List<CartItem>> = dataStore.data.map { prefs ->
        decodeItems(prefs[KEY_CART_ITEMS]).map { it.toDomain() }
    }

    override val totalItemCount: Flow<Int> = cartItems.map { items ->
        items.sumOf { it.quantity }
    }

    override val subtotal: Flow<Double> = cartItems.map { items ->
        items.sumOf { it.lineTotal }
    }

    override suspend fun addProduct(
        product: Product,
        quantity: Int,
        selectedSize: String?,
        selectedColor: String?,
    ) {
        if (quantity <= 0 || product.stock <= 0) return

        val normalizedSize = selectedSize?.trim()?.takeIf { it.isNotEmpty() }
        val normalizedColor = selectedColor?.trim()?.takeIf { it.isNotEmpty() }

        updateCart { current ->
            val targetKey = "${product.id}|${normalizedSize.orEmpty()}|${normalizedColor.orEmpty()}"
            val existingIndex = current.indexOfFirst { it.toDomain().lineKey == targetKey }

            val effectiveUnit = product.effectivePrice()
            if (existingIndex >= 0) {
                val existing = current[existingIndex]
                val clampedQty = (existing.quantity + quantity).coerceIn(1, product.stock)
                current[existingIndex] = existing.copy(
                    productName = product.name,
                    productNameEn = product.nameEn,
                    unitPrice = effectiveUnit,
                    regularPrice = product.price,
                    flashSalePrice = product.flashSalePrice,
                    flashSaleStartsAt = product.flashSaleStartsAt,
                    flashSaleEndsAt = product.flashSaleEndsAt,
                    oldPrice = product.oldPrice,
                    imageUrl = product.imageUrl,
                    quantity = clampedQty,
                    maxStock = product.stock,
                )
            } else {
                current += CartItemEntity(
                    productId = product.id,
                    productName = product.name,
                    productNameEn = product.nameEn,
                    unitPrice = effectiveUnit,
                    regularPrice = product.price,
                    flashSalePrice = product.flashSalePrice,
                    flashSaleStartsAt = product.flashSaleStartsAt,
                    flashSaleEndsAt = product.flashSaleEndsAt,
                    oldPrice = product.oldPrice,
                    imageUrl = product.imageUrl,
                    quantity = quantity.coerceIn(1, product.stock),
                    maxStock = product.stock,
                    selectedSize = normalizedSize,
                    selectedColor = normalizedColor,
                )
            }
        }
    }

    override suspend fun updateQuantity(lineKey: String, quantity: Int) {
        updateCart { current ->
            val index = current.indexOfFirst { it.toDomain().lineKey == lineKey }
            if (index < 0) return@updateCart
            if (quantity <= 0) {
                current.removeAt(index)
            } else {
                val existing = current[index]
                val maxAllowed = existing.maxStock.coerceAtLeast(1)
                current[index] = existing.copy(quantity = quantity.coerceIn(1, maxAllowed))
            }
        }
    }

    override suspend fun removeItem(lineKey: String) {
        updateCart { current ->
            current.removeAll { it.toDomain().lineKey == lineKey }
        }
    }

    override suspend fun settleReceipt(receipt: com.whitelabel.commerce.core.domain.model.SavedOrderReceipt) {
        val marker = androidx.datastore.preferences.core.booleanPreferencesKey(
            "${com.whitelabel.commerce.BuildConfig.STORE_ID}_settled_${receipt.orderNumber}",
        )
        dataStore.edit { prefs ->
            if (prefs[marker] == true) return@edit
            val remaining = decodeItems(prefs[KEY_CART_ITEMS]).mapNotNull { line ->
                val purchased = receipt.items.filter { it.productId == line.productId && it.size == line.selectedSize && it.color == line.selectedColor }.sumOf { it.quantity }
                line.copy(quantity = line.quantity - purchased).takeIf { it.quantity > 0 }
            }
            if (remaining.isEmpty()) {
                prefs.remove(KEY_CART_ITEMS)
            } else {
                prefs[KEY_CART_ITEMS] = json.encodeToString(remaining)
            }
            prefs[marker] = true
        }
    }

    override suspend fun clearCart() {
        dataStore.edit { prefs ->
            prefs.remove(KEY_CART_ITEMS)
        }
    }

    private suspend fun updateCart(transform: (MutableList<CartItemEntity>) -> Unit) {
        dataStore.edit { prefs ->
            val mutable = decodeItems(prefs[KEY_CART_ITEMS]).toMutableList()
            transform(mutable)
            if (mutable.isEmpty()) {
                prefs.remove(KEY_CART_ITEMS)
            } else {
                prefs[KEY_CART_ITEMS] = json.encodeToString(mutable)
            }
        }
    }

    private fun decodeItems(raw: String?): List<CartItemEntity> {
        if (raw.isNullOrBlank()) return emptyList()
        return runCatching {
            json.decodeFromString<List<CartItemEntity>>(raw)
        }.getOrDefault(emptyList())
    }

    private companion object {
        val KEY_CART_ITEMS = stringPreferencesKey("${com.whitelabel.commerce.BuildConfig.STORE_ID}_cart_items_json")
    }
}
