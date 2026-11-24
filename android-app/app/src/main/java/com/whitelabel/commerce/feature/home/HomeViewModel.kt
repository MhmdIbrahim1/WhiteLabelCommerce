package com.whitelabel.commerce.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.whitelabel.commerce.core.domain.model.Category
import com.whitelabel.commerce.core.domain.model.Product
import com.whitelabel.commerce.core.domain.model.StoreSettings
import com.whitelabel.commerce.core.domain.repository.CartRepository
import com.whitelabel.commerce.core.domain.repository.CatalogRepository
import com.whitelabel.commerce.core.domain.repository.StoreRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HomeUiState(
    val storeSettings: StoreSettings = StoreSettings(),
    val categories: List<Category> = emptyList(),
    val featuredProducts: List<Product> = emptyList(),
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val storeRepository: StoreRepository,
    private val catalogRepository: CatalogRepository,
    private val cartRepository: CartRepository,
) : ViewModel() {

    private val localState = MutableStateFlow(HomeUiState())

    val uiState: StateFlow<HomeUiState> = combine(
        storeRepository.storeSettings,
        localState,
    ) { settings, state ->
        state.copy(storeSettings = settings)
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = HomeUiState(storeSettings = storeRepository.storeSettings.value),
    )

    init {
        loadHomeData(isPullRefresh = false)
    }

    fun loadHomeData(isPullRefresh: Boolean = false) {
        viewModelScope.launch {
            localState.update {
                it.copy(
                    isLoading = !isPullRefresh && it.featuredProducts.isEmpty(),
                    isRefreshing = isPullRefresh,
                    errorMessage = null,
                )
            }

            val settingsDeferred = async { storeRepository.refreshStoreSettings() }
            val categoriesDeferred = async { catalogRepository.getCategories() }
            val productsDeferred = async { catalogRepository.getActiveProducts(limit = 20) }

            settingsDeferred.await()
            val categoriesResult = categoriesDeferred.await()
            val productsResult = productsDeferred.await()
            val firstError = categoriesResult.exceptionOrNull() ?: productsResult.exceptionOrNull()

            localState.update { prev ->
                prev.copy(
                    categories = categoriesResult.getOrElse { prev.categories },
                    featuredProducts = productsResult.getOrElse { prev.featuredProducts },
                    isLoading = false,
                    isRefreshing = false,
                    errorMessage = firstError?.localizedMessage,
                )
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
