package com.whitelabel.commerce.feature.catalog

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.whitelabel.commerce.core.designsystem.localized
import com.whitelabel.commerce.core.domain.model.Category
import com.whitelabel.commerce.core.domain.model.Product
import com.whitelabel.commerce.core.domain.repository.CartRepository
import com.whitelabel.commerce.core.domain.repository.CatalogRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class CatalogSortOption(private val arabicText: String) {
    NEWEST("الأحدث"),
    PRICE_LOW_TO_HIGH("الأقل سعراً"),
    PRICE_HIGH_TO_LOW("الأعلى سعراً");

    val labelAr: String
        get() = localized(
            arabicText,
            when (this) {
                NEWEST -> "Newest"
                PRICE_LOW_TO_HIGH -> "Lowest price"
                PRICE_HIGH_TO_LOW -> "Highest price"
            },
        )
}

data class CatalogUiState(
    val categories: List<Category> = emptyList(),
    val rawProducts: List<Product> = emptyList(),
    val selectedCategoryId: String? = null,
    val searchQuery: String = "",
    val instantHints: List<InstantSearchHint> = emptyList(),
    val isClosestSmartMatch: Boolean = false,
    val sortOption: CatalogSortOption = CatalogSortOption.NEWEST,
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
) {
    val displayedProducts: List<Product>
        get() = when (sortOption) {
            CatalogSortOption.NEWEST -> rawProducts
            CatalogSortOption.PRICE_LOW_TO_HIGH -> rawProducts.sortedBy { it.price }
            CatalogSortOption.PRICE_HIGH_TO_LOW -> rawProducts.sortedByDescending { it.price }
        }
}

@HiltViewModel
class CatalogViewModel @Inject constructor(
    private val catalogRepository: CatalogRepository,
    private val cartRepository: CartRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(CatalogUiState())
    val uiState: StateFlow<CatalogUiState> = _uiState.asStateFlow()

    private var searchJob: Job? = null

    init {
        loadInitial()
    }

    fun applyExternalCategory(categoryId: String?) {
        if (_uiState.value.selectedCategoryId != categoryId) {
            _uiState.update { it.copy(selectedCategoryId = categoryId) }
            fetchProducts(isPullRefresh = false)
        }
    }

    fun loadInitial() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            val categoriesDeferred = async { catalogRepository.getCategories() }
            val current = _uiState.value
            val productsDeferred = async {
                if (current.searchQuery.isNotBlank()) {
                    catalogRepository.searchProducts(
                        query = current.searchQuery,
                        categoryId = current.selectedCategoryId,
                    )
                } else {
                    catalogRepository.getActiveProducts(
                        categoryId = current.selectedCategoryId,
                    ).map { com.whitelabel.commerce.core.domain.repository.CatalogSearchResult(it, false) }
                }
            }

            val categoriesResult = categoriesDeferred.await()
            val productsResult = productsDeferred.await()
            val error = categoriesResult.exceptionOrNull() ?: productsResult.exceptionOrNull()

            _uiState.update { prev ->
                val searchRes = productsResult.getOrNull()
                prev.copy(
                    categories = categoriesResult.getOrElse { prev.categories },
                    rawProducts = searchRes?.products ?: prev.rawProducts,
                    isClosestSmartMatch = searchRes?.isClosestSmartMatch ?: false,
                    isLoading = false,
                    isRefreshing = false,
                    errorMessage = error?.localizedMessage,
                )
            }
        }
    }

    fun refresh() {
        fetchProducts(isPullRefresh = true)
    }

    fun onSearchQueryChange(query: String) {
        val hints = SearchSynonyms.getInstantHints(query)
        _uiState.update { it.copy(searchQuery = query, instantHints = hints) }
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(180)
            fetchProducts(isPullRefresh = false)
        }
    }

    fun onHintClick(hint: InstantSearchHint) {
        val q = hint.displayQuery
        _uiState.update { it.copy(searchQuery = q, instantHints = emptyList()) }
        searchJob?.cancel()
        fetchProducts(isPullRefresh = false)
    }

    fun onCategorySelect(categoryId: String?) {
        if (_uiState.value.selectedCategoryId == categoryId) return
        _uiState.update { it.copy(selectedCategoryId = categoryId) }
        fetchProducts(isPullRefresh = false)
    }

    fun onSortSelect(sortOption: CatalogSortOption) {
        _uiState.update { it.copy(sortOption = sortOption) }
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

    private fun fetchProducts(isPullRefresh: Boolean) {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isLoading = !isPullRefresh,
                    isRefreshing = isPullRefresh,
                    errorMessage = null,
                )
            }
            val current = _uiState.value
            val result = if (current.searchQuery.isNotBlank()) {
                catalogRepository.searchProducts(
                    query = current.searchQuery,
                    categoryId = current.selectedCategoryId,
                )
            } else {
                catalogRepository.getActiveProducts(
                    categoryId = current.selectedCategoryId,
                ).map { com.whitelabel.commerce.core.domain.repository.CatalogSearchResult(it, false) }
            }

            result.onSuccess { searchResult ->
                _uiState.update {
                    it.copy(
                        rawProducts = searchResult.products,
                        isClosestSmartMatch = searchResult.isClosestSmartMatch,
                        isLoading = false,
                        isRefreshing = false,
                    )
                }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        errorMessage = error.localizedMessage,
                    )
                }
            }
        }
    }
}
