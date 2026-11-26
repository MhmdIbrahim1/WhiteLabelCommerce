package com.whitelabel.commerce.feature.wishlist

import com.whitelabel.commerce.core.designsystem.localized
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.whitelabel.commerce.core.domain.model.AuthSessionState
import com.whitelabel.commerce.core.domain.model.Product
import com.whitelabel.commerce.core.domain.model.WishlistItem
import com.whitelabel.commerce.core.domain.repository.AuthRepository
import com.whitelabel.commerce.core.domain.repository.CartRepository
import com.whitelabel.commerce.core.domain.repository.WishlistRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class WishlistUiState(
    val isSignedIn: Boolean = false,
    val items: List<WishlistItem> = emptyList(),
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
)

@HiltViewModel
class WishlistViewModel @Inject constructor(
    private val wishlistRepository: WishlistRepository,
    private val cartRepository: CartRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(
        WishlistUiState(isSignedIn = authRepository.sessionState.value is AuthSessionState.SignedIn),
    )
    val uiState: StateFlow<WishlistUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            authRepository.sessionState.collect { session ->
                val signedIn = session is AuthSessionState.SignedIn
                _uiState.update { it.copy(isSignedIn = signedIn) }
                if (signedIn) {
                    loadWishlist(isPullRefresh = false)
                } else {
                    _uiState.update { it.copy(items = emptyList(), isLoading = false, isRefreshing = false) }
                }
            }
        }
    }

    fun loadWishlist(isPullRefresh: Boolean = false) {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isLoading = !isPullRefresh && it.items.isEmpty(),
                    isRefreshing = isPullRefresh,
                    errorMessage = null,
                )
            }
            wishlistRepository.getWishlistItems()
                .onSuccess { items ->
                    _uiState.update {
                        it.copy(
                            items = items,
                            isLoading = false,
                            isRefreshing = false,
                            errorMessage = null,
                        )
                    }
                }
                .onFailure { err ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            isRefreshing = false,
                            errorMessage = localized("تعذر تحميل المفضلة. حاول مرة أخرى.", "Could not load your wishlist. Please try again."),
                        )
                    }
                }
        }
    }

    fun removeFromWishlist(productId: String) {
        val prev = _uiState.value.items
        _uiState.update { it.copy(items = it.items.filterNot { item -> item.productId == productId }) }
        viewModelScope.launch {
            val outcome = wishlistRepository.toggleWishlist(productId)
            if (outcome !is com.whitelabel.commerce.core.domain.model.WishlistToggleOutcome.Toggled) {
                _uiState.update { it.copy(items = prev) }
            }
        }
    }

    fun quickAddToCart(product: Product) {
        viewModelScope.launch {
            cartRepository.addProduct(
                product = product,
                quantity = 1,
                selectedSize = product.sizes.firstOrNull(),
                selectedColor = product.colors.firstOrNull(),
            )
        }
    }
}
