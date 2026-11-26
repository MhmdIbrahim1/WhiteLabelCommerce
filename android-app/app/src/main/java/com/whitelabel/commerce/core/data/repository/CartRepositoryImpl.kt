package com.whitelabel.commerce.core.data.repository

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.whitelabel.commerce.BuildConfig
import com.whitelabel.commerce.core.data.local.CartItemEntity
import com.whitelabel.commerce.core.data.remote.dto.AbandonedCartItemParamDto
import com.whitelabel.commerce.core.data.remote.dto.AbandonedCartSessionKeys
import com.whitelabel.commerce.core.data.remote.dto.MarkAbandonedCartRecoveredParamsDto
import com.whitelabel.commerce.core.data.remote.dto.UpsertAbandonedCartParamsDto
import com.whitelabel.commerce.core.domain.model.CartItem
import com.whitelabel.commerce.core.domain.model.Product
import com.whitelabel.commerce.core.domain.repository.CartRepository
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
import com.whitelabel.commerce.core.data.remote.dto.VariantDto
import com.whitelabel.commerce.core.data.remote.runSuspendCatching
import com.whitelabel.commerce.core.domain.model.remainingQuantity
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
private data class InventoryRow(val id: String, val stock: Int, @SerialName("max_order_qty") val limit: Int? = null,
    @SerialName("product_variants") val variants: List<VariantDto> = emptyList()) {
    fun stockFor(color: String?, size: String?): Int = if (variants.isEmpty()) stock
        else variants.find { it.color == color.orEmpty() && it.size == size.orEmpty() }?.stock ?: 0
}

@Singleton
class CartRepositoryImpl @Inject constructor(
    private val dataStore: DataStore<Preferences>,
    private val json: Json,
    private val supabase: SupabaseClient,
    private val storeRepository: com.whitelabel.commerce.core.domain.repository.StoreRepository,
) : CartRepository {

    private val syncScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var pendingSyncJob: Job? = null

    @Volatile
    private var lastKnownCurrency: String? = null

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
    ): Int {
        if (quantity <= 0) return 0
        val live = inventory(listOf(product.id)).getOrNull()
        val row = live?.get(product.id)
        if (live != null && row == null) return 0
        val available = row?.stockFor(selectedColor, selectedSize) ?: product.inventory.stock(selectedColor, selectedSize, product.stock)
        val totalStock = row?.stock ?: product.stock
        val override = if (row == null) product.maxOrderQty else row.limit
        var added = 0
        val normalizedSize = selectedSize?.trim()?.takeIf { it.isNotEmpty() }
        val normalizedColor = selectedColor?.trim()?.takeIf { it.isNotEmpty() }

        updateCart { current ->
            val targetKey = "${product.id}|${normalizedSize.orEmpty()}|${normalizedColor.orEmpty()}"
            val existingIndex = current.indexOfFirst { it.toDomain().lineKey == targetKey }

            val room = current.map { it.toDomain() }.remainingQuantity(product.id, normalizedSize, normalizedColor,
                available, totalStock, override, storeRepository.storeSettings.value.defaultMaxOrderQty)
            added = minOf(quantity, room.coerceAtLeast(0))
            if (added == 0) return@updateCart
            val effectiveUnit = product.effectivePrice()
            if (existingIndex >= 0) {
                val existing = current[existingIndex]
                current[existingIndex] = existing.copy(
                    productName = product.name,
                    productNameEn = product.nameEn,
                    unitPrice = effectiveUnit,
                    regularPrice = product.price,
                    flashSalePrice = product.flashSalePrice,
                    flashSaleStartsAt = product.flashSaleStartsAt,
                    flashSaleEndsAt = product.flashSaleEndsAt,
                    oldPrice = product.oldPrice,
                    imageUrl = product.imageFor(normalizedColor),
                    quantity = existing.quantity + added,
                    maxStock = available, productStock = totalStock, maxOrderQty = override,
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
                    imageUrl = product.imageFor(normalizedColor),
                    quantity = added,
                    maxStock = available, productStock = totalStock, maxOrderQty = override,
                    selectedSize = normalizedSize,
                    selectedColor = normalizedColor,
                )
            }
        }
        return added
    }

    private suspend fun inventory(ids: List<String>) = runSuspendCatching {
        supabase.from("products").select(Columns.raw("id,stock,max_order_qty,product_variants(color,size,stock)")) {
            filter { eq("store_id", BuildConfig.STORE_ID); eq("is_active", true); isIn("id", ids) }
        }.decodeList<InventoryRow>().associateBy { it.id }
    }

    override suspend fun refreshInventory() {
        val ids = cartItems.first().map { it.productId }.distinct()
        if (ids.isEmpty()) return
        val live = inventory(ids).getOrNull() ?: return
        updateCart { lines ->
            lines.replaceAll { line ->
                if (line.productId !in ids) line else {
                    val row = live[line.productId]
                    line.copy(maxStock = row?.stockFor(line.selectedColor, line.selectedSize) ?: 0,
                        productStock = row?.stock ?: 0, maxOrderQty = row?.limit)
                }
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
                val room = current.map { it.toDomain() }.remainingQuantity(existing.toDomain(), storeRepository.storeSettings.value.defaultMaxOrderQty)
                if (quantity <= existing.quantity || quantity - existing.quantity <= room) {
                    current[index] = existing.copy(quantity = quantity)
                }
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
            "${BuildConfig.STORE_ID}_settled_${receipt.orderNumber}",
        )
        var newlySettled = false
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
            newlySettled = true
        }
        if (newlySettled) markAbandonedCartRecoveredAsync(receipt.orderNumber)
    }

    override suspend fun clearCart() {
        dataStore.edit { prefs ->
            prefs.remove(KEY_CART_ITEMS)
        }
        syncAbandonedCartAsync(lastKnownCurrency ?: storeRepository.storeSettings.value.currency)
    }

    override fun syncAbandonedCartAsync(currency: String) {
        val cleanCurrency = currency.trim().uppercase().ifEmpty { "EGP" }
        lastKnownCurrency = cleanCurrency
        pendingSyncJob?.cancel()
        pendingSyncJob = syncScope.launch {
            delay(1_200)
            runCatching {
                val user = supabase.auth.currentUserOrNull() ?: return@runCatching
                val currentItems = cartItems.first()
                val totalAmount = currentItems.sumOf { it.lineTotal }
                val params = UpsertAbandonedCartParamsDto(
                    storeId = BuildConfig.STORE_ID,
                    sessionKey = AbandonedCartSessionKeys.forAndroidUser(user.id),
                    items = currentItems.map { item ->
                        AbandonedCartItemParamDto(
                            id = item.productId,
                            name = item.productName,
                            nameEn = item.productNameEn,
                            quantity = item.quantity,
                            price = item.effectiveUnitPrice(),
                            size = item.selectedSize,
                            color = item.selectedColor,
                        )
                    },
                    subtotal = totalAmount,
                    currency = cleanCurrency,
                    source = "android",
                    customerEmail = user.email,
                )
                supabase.postgrest.rpc(
                    function = "upsert_abandoned_cart",
                    parameters = json.encodeToJsonElement(params).jsonObject,
                )
            }
        }
    }

    override fun markAbandonedCartRecoveredAsync(orderId: String?) {
        pendingSyncJob?.cancel()
        syncScope.launch {
            runCatching {
                val user = supabase.auth.currentUserOrNull() ?: return@runCatching
                val params = MarkAbandonedCartRecoveredParamsDto(
                    storeId = BuildConfig.STORE_ID,
                    sessionKey = AbandonedCartSessionKeys.forAndroidUser(user.id),
                    orderId = orderId?.trim()?.takeIf { it.isNotEmpty() },
                )
                supabase.postgrest.rpc(
                    function = "mark_abandoned_cart_recovered",
                    parameters = json.encodeToJsonElement(params).jsonObject,
                )
            }
        }
    }

    private suspend fun updateCart(transform: (MutableList<CartItemEntity>) -> Unit) {
        var changed = false
        dataStore.edit { prefs ->
            val previous = decodeItems(prefs[KEY_CART_ITEMS])
            val mutable = previous.toMutableList()
            transform(mutable)
            changed = mutable != previous
            if (!changed) return@edit
            if (mutable.isEmpty()) {
                prefs.remove(KEY_CART_ITEMS)
            } else {
                prefs[KEY_CART_ITEMS] = json.encodeToString(mutable)
            }
        }
        if (changed) syncAbandonedCartAsync(lastKnownCurrency ?: storeRepository.storeSettings.value.currency)
    }

    private fun decodeItems(raw: String?): List<CartItemEntity> {
        if (raw.isNullOrBlank()) return emptyList()
        return runCatching {
            json.decodeFromString<List<CartItemEntity>>(raw)
        }.getOrDefault(emptyList())
    }

    private companion object {
        val KEY_CART_ITEMS = stringPreferencesKey("${BuildConfig.STORE_ID}_cart_items_json")
    }
}
