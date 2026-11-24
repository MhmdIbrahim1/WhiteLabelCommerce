package com.whitelabel.commerce.feature.catalog

import com.whitelabel.commerce.core.designsystem.localized

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.whitelabel.commerce.core.domain.model.Product
import com.whitelabel.commerce.core.domain.repository.CartRepository
import com.whitelabel.commerce.core.domain.repository.CatalogRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ProductDetailUiState(
    val product: Product? = null,
    val selectedSize: String? = null,
    val selectedColor: String? = null,
    val quantity: Int = 1,
    val isLoading: Boolean = true,
    val errorMessage: String? = null,
) {
    val canAddToCart: Boolean
        get() {
            val p = product ?: return false
            if (!p.isInStock || quantity <= 0 || quantity > p.stock) return false
            if (p.sizes.isNotEmpty() && selectedSize.isNullOrBlank()) return false
            if (p.colors.isNotEmpty() && selectedColor.isNullOrBlank()) return false
            return true
        }
}

@HiltViewModel
class ProductDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val catalogRepository: CatalogRepository,
    private val cartRepository: CartRepository,
) : ViewModel() {

    private val productId: String = checkNotNull(savedStateHandle["productId"])

    private val _uiState = MutableStateFlow(ProductDetailUiState())
    val uiState: StateFlow<ProductDetailUiState> = _uiState.asStateFlow()

    init {
        loadProduct()
    }

    fun loadProduct() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            catalogRepository.getProductById(productId)
                .onSuccess { product ->
                    if (product == null) {
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                errorMessage = localized("المنتج غير متوفر حالياً.", "Product currently unavailable."),
                            )
                        }
                    } else {
                        _uiState.update {
                            it.copy(
                                product = product,
                                selectedSize = product.sizes.firstOrNull(),
                                selectedColor = product.colors.firstOrNull(),
                                quantity = if (product.stock > 0) 1 else 0,
                                isLoading = false,
                            )
                        }
                    }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            errorMessage = error.localizedMessage ?: localized("تعذر تحميل بيانات المنتج.", "Unable to load product."),
                        )
                    }
                }
        }
    }

    fun selectSize(size: String) {
        _uiState.update { it.copy(selectedSize = size) }
    }

    fun selectColor(color: String) {
        _uiState.update { it.copy(selectedColor = color) }
    }

    fun incrementQuantity() {
        _uiState.update { state ->
            val maxStock = state.product?.stock ?: 1
            if (state.quantity < maxStock) state.copy(quantity = state.quantity + 1) else state
        }
    }

    fun decrementQuantity() {
        _uiState.update { state ->
            if (state.quantity > 1) state.copy(quantity = state.quantity - 1) else state
        }
    }

    fun addToCart(onAdded: (String) -> Unit) {
        val state = _uiState.value
        val product = state.product ?: return
        if (!state.canAddToCart) return

        viewModelScope.launch {
            cartRepository.addProduct(
                product = product,
                quantity = state.quantity,
                selectedSize = state.selectedSize,
                selectedColor = state.selectedColor,
            )
            onAdded(localized("تمت إضافة ${state.quantity} × \"${product.displayName}\" إلى السلة", "Added ${state.quantity} × ${product.displayName} to cart"))
        }
    }
}
