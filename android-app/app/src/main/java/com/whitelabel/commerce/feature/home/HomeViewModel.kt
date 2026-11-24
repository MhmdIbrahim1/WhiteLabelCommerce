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
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
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
    val searchQuery: String = "",
    val searchResults: List<Product> = emptyList(),
    val isSearching: Boolean = false,
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
) {
    val isSearchActive: Boolean
        get() = searchQuery.trim().isNotEmpty()
}

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val storeRepository: StoreRepository,
    private val catalogRepository: CatalogRepository,
    private val cartRepository: CartRepository,
) : ViewModel() {

    private val localState = MutableStateFlow(HomeUiState())
    private var searchJob: Job? = null

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
                val nextFeatured = productsResult.getOrElse { prev.featuredProducts }
                prev.copy(
                    categories = categoriesResult.getOrElse { prev.categories },
                    featuredProducts = nextFeatured,
                    isLoading = false,
                    isRefreshing = false,
                    errorMessage = firstError?.localizedMessage,
                )
            }
        }
    }

    fun onSearchQueryChange(query: String) {
        val trimmed = query.trim()
        searchJob?.cancel()

        if (trimmed.isEmpty()) {
            localState.update {
                it.copy(
                    searchQuery = query,
                    searchResults = emptyList(),
                    isSearching = false,
                )
            }
            return
        }

        // 0ms instant bilingual local fuzzy match against loaded featured products
        val instantHits = fuzzyFilterProducts(localState.value.featuredProducts, trimmed)
        localState.update {
            it.copy(
                searchQuery = query,
                searchResults = instantHits,
                isSearching = true,
            )
        }

        // 180ms debounced full-catalog smart search via Supabase `search_products_fast`
        searchJob = viewModelScope.launch {
            delay(180)
            catalogRepository.searchProducts(query = trimmed, limit = 24)
                .onSuccess { res ->
                    if (localState.value.searchQuery.trim() == trimmed) {
                        val merged = if (res.products.isNotEmpty()) {
                            res.products
                        } else {
                            fuzzyFilterProducts(localState.value.featuredProducts, trimmed)
                        }
                        localState.update {
                            it.copy(searchResults = merged, isSearching = false)
                        }
                    }
                }
                .onFailure {
                    if (localState.value.searchQuery.trim() == trimmed) {
                        localState.update { it.copy(isSearching = false) }
                    }
                }
        }
    }

    fun clearSearch() {
        searchJob?.cancel()
        localState.update {
            it.copy(
                searchQuery = "",
                searchResults = emptyList(),
                isSearching = false,
            )
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

    private fun fuzzyFilterProducts(products: List<Product>, query: String): List<Product> {
        val tokens = normalizeSearchText(query).split(' ').filter { it.isNotBlank() }
        if (tokens.isEmpty()) return emptyList()
        return products.filter { product ->
            val haystack = normalizeSearchText(
                listOfNotNull(
                    product.name,
                    product.nameEn,
                    product.description,
                    product.descriptionEn,
                ).joinToString(" "),
            )
            tokens.all { token -> haystack.contains(token) }
        }
    }

    private fun normalizeSearchText(raw: String): String {
        return raw.lowercase()
            .replace(Regex("[\\u064B-\\u0652\\u0670]"), "")
            .replace('أ', 'ا')
            .replace('إ', 'ا')
            .replace('آ', 'ا')
            .replace('ة', 'ه')
            .replace('ى', 'ي')
            .trim()
    }
}
