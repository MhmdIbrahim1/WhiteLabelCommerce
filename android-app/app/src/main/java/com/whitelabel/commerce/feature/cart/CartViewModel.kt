package com.whitelabel.commerce.feature.cart

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.whitelabel.commerce.core.domain.model.CartItem
import com.whitelabel.commerce.core.domain.model.Product
import com.whitelabel.commerce.core.domain.model.StoreSettings
import com.whitelabel.commerce.core.domain.repository.CartRepository
import com.whitelabel.commerce.core.domain.repository.CatalogRepository
import com.whitelabel.commerce.core.domain.repository.StoreRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlin.math.roundToInt
import javax.inject.Inject

data class CartUiState(
    val items: List<CartItem> = emptyList(),
    val defaultLimit: Int? = 10,
    val upsellProducts: List<Product> = emptyList(),
    val subtotal: Double = 0.0,
    val baseShippingFee: Double = 0.0,
    val shippingFee: Double = 0.0,
    val cartIncentiveEnabled: Boolean = true,
    val freeShippingThreshold: Double = 1000.0,
    val currency: String = "EGP",
    val locale: String = "ar-EG",
) {
    val total: Double
        get() = if (items.isEmpty()) 0.0 else subtotal + shippingFee

    val remainingForFreeShipping: Double
        get() = if (cartIncentiveEnabled && freeShippingThreshold > 0.0) {
            (freeShippingThreshold - subtotal).coerceAtLeast(0.0)
        } else {
            0.0
        }
}

private data class UpsellQueryKey(
    val enabled: Boolean,
    val cartIds: List<String>,
    val roundedGap: Int,
)

@HiltViewModel
class CartViewModel @Inject constructor(
    private val cartRepository: CartRepository,
    private val catalogRepository: CatalogRepository,
    storeRepository: StoreRepository,
) : ViewModel() {

    private val upsellsState = MutableStateFlow<List<Product>>(emptyList())

    val uiState: StateFlow<CartUiState> = combine(
        cartRepository.cartItems,
        cartRepository.subtotal,
        storeRepository.storeSettings,
        upsellsState,
    ) { items, subtotal, settings: StoreSettings, upsells ->
        CartUiState(
            items = items, defaultLimit = settings.defaultMaxOrderQty,
            upsellProducts = upsells,
            subtotal = subtotal,
            baseShippingFee = settings.shippingFee,
            shippingFee = if (items.isEmpty()) 0.0 else settings.effectiveShippingFee(subtotal),
            cartIncentiveEnabled = settings.cartIncentiveEnabled,
            freeShippingThreshold = settings.freeShippingThreshold,
            currency = settings.currency,
            locale = settings.locale,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = CartUiState(),
    )

    init {
        viewModelScope.launch { cartRepository.refreshInventory() }
        viewModelScope.launch {
            combine(
                cartRepository.cartItems,
                cartRepository.subtotal,
                storeRepository.storeSettings,
            ) { items, subtotal, settings ->
                val gap = if (items.isNotEmpty() && settings.cartIncentiveEnabled && settings.freeShippingThreshold > 0.0) {
                    (settings.freeShippingThreshold - subtotal).coerceAtLeast(0.0)
                } else {
                    0.0
                }
                UpsellQueryKey(
                    enabled = items.isNotEmpty() && gap > 0.0,
                    cartIds = items.map { it.productId }.distinct().sorted(),
                    roundedGap = gap.roundToInt(),
                )
            }
                .distinctUntilChanged()
                .collectLatest { query ->
                    if (!query.enabled) {
                        upsellsState.value = emptyList()
                    } else {
                        catalogRepository.getCartUpsellProducts(
                            cartProductIds = query.cartIds,
                            gapAmount = query.roundedGap.toDouble(),
                            limit = 4,
                        ).onSuccess { rows ->
                            upsellsState.value = rows
                        }
                    }
                }
        }
        viewModelScope.launch {
            combine(cartRepository.cartItems, storeRepository.storeSettings) { items, settings ->
                items.size to settings.currency
            }
                .distinctUntilChanged()
                .collectLatest { (count, currency) ->
                    if (count > 0) {
                        cartRepository.syncAbandonedCartAsync(currency)
                    }
                }
        }
    }

    fun addUpsellProduct(product: Product) {
        viewModelScope.launch {
            cartRepository.addProduct(
                product = product,
                quantity = 1,
                selectedSize = product.sizes.firstOrNull(),
                selectedColor = product.colors.firstOrNull(),
            )
        }
    }

    fun increment(item: CartItem) {
        viewModelScope.launch {
            cartRepository.updateQuantity(item.lineKey, item.quantity + 1)
        }
    }

    fun decrement(item: CartItem) {
        viewModelScope.launch {
            cartRepository.updateQuantity(item.lineKey, item.quantity - 1)
        }
    }

    fun remove(lineKey: String) {
        viewModelScope.launch {
            cartRepository.removeItem(lineKey)
        }
    }

    fun clearCart() {
        viewModelScope.launch {
            cartRepository.clearCart()
        }
    }
}
