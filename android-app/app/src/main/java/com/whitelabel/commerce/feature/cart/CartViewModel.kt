package com.whitelabel.commerce.feature.cart

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.whitelabel.commerce.core.domain.model.CartItem
import com.whitelabel.commerce.core.domain.model.StoreSettings
import com.whitelabel.commerce.core.domain.repository.CartRepository
import com.whitelabel.commerce.core.domain.repository.StoreRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class CartUiState(
    val items: List<CartItem> = emptyList(),
    val subtotal: Double = 0.0,
    val shippingFee: Double = 0.0,
    val currency: String = "EGP",
    val locale: String = "ar-EG",
) {
    val total: Double
        get() = if (items.isEmpty()) 0.0 else subtotal + shippingFee
}

@HiltViewModel
class CartViewModel @Inject constructor(
    private val cartRepository: CartRepository,
    storeRepository: StoreRepository,
) : ViewModel() {

    val uiState: StateFlow<CartUiState> = combine(
        cartRepository.cartItems,
        cartRepository.subtotal,
        storeRepository.storeSettings,
    ) { items, subtotal, settings: StoreSettings ->
        CartUiState(
            items = items,
            subtotal = subtotal,
            shippingFee = settings.shippingFee,
            currency = settings.currency,
            locale = settings.locale,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = CartUiState(),
    )

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
